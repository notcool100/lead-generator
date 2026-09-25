import { prisma, type Prisma } from "@/lib/db";
import { audit, leadEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { normalizeAddress, normalizeBusinessName, normalizeEmail, extractDomain } from "@/lib/normalize";
import { getLeadProvider, type LeadProvider } from "@/providers/leads";
import type { NextAction } from "@/queue/queues";
import type { NormalizedBusiness } from "@/types/lead";
import { dedupeKeys } from "./dedupe";

async function findExisting(b: NormalizedBusiness) {
  const k = dedupeKeys(b);
  const or: Prisma.LeadWhereInput[] = [];
  if (b.sourceExternalId) or.push({ source: b.source, sourceExternalId: b.sourceExternalId });
  if (k.nameAddress) or.push({ normalizedName: normalizeBusinessName(b.businessName), normalizedAddress: normalizeAddress(b.address) });
  if (k.domain) or.push({ domain: k.domain });
  if (k.email) or.push({ email: k.email });
  if (!or.length) return null;
  return prisma.lead.findFirst({ where: { OR: or } });
}

/** Fills gaps on an existing lead with data from another source (never overwrites). */
async function enrichExisting(existing: NonNullable<Awaited<ReturnType<typeof findExisting>>>, b: NormalizedBusiness) {
  const data: Prisma.LeadUpdateInput = {};
  if (!existing.phone && b.phone) data.phone = b.phone;
  const email = normalizeEmail(b.email);
  if (!existing.email && email) data.email = email;
  if (!existing.address && b.address) {
    data.address = b.address;
    data.normalizedAddress = normalizeAddress(b.address);
  }
  if (existing.rating == null && b.rating != null) data.rating = b.rating;
  if (existing.reviewCount == null && b.reviewCount != null) data.reviewCount = b.reviewCount;
  if (!existing.description && b.description) data.description = b.description;
  if (existing.latitude == null && b.latitude != null) {
    data.latitude = b.latitude;
    data.longitude = b.longitude;
  }
  // A newly found website only matters before the website check ran.
  if (!existing.websiteUrl && b.websiteUrl && existing.websiteStatus === "unknown") {
    data.websiteUrl = b.websiteUrl;
    data.domain = extractDomain(b.websiteUrl);
  }
  if (b.socialLinks) data.socialLinks = { ...((existing.socialLinks as Record<string, string> | null) ?? {}), ...b.socialLinks };
  if (!existing.sources.includes(b.source)) data.sources = { push: b.source };
  if (Object.keys(data).length) {
    await prisma.lead.update({ where: { id: existing.id }, data });
    const fields = Object.keys(data).filter((k) => k !== "sources" && k !== "normalizedAddress" && k !== "domain");
    if (fields.length) await leadEvent(existing.id, "enriched", `Merged data from ${b.source}: ${fields.join(", ")}`);
  }
}

export interface DiscoveryResult {
  created: number;
  duplicates: number;
  next: NextAction[];
  /** true when every source has no more results for this campaign */
  exhausted?: boolean;
}

/** Max new leads per discovery run ("Discover more" fetches the next batch). */
export const DISCOVERY_BATCH_SIZE = Math.max(1, Number(process.env.DISCOVERY_BATCH_SIZE ?? 20));
export const CURSOR_DONE = "done";

/**
 * Pulls businesses for a campaign from the configured provider, de-duplicates
 * them and creates leads. Returns follow-up website-analysis jobs.
 */
export async function discoverLeadsForCampaign(campaignId: string, providerOverride?: LeadProvider): Promise<DiscoveryResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const provider = providerOverride ?? getLeadProvider(campaign.leadSources);
  const failedSources = new Set<string>();
  if (campaign.status !== "running") {
    logger.info({ campaignId, status: campaign.status }, "campaign not running; skipping discovery");
    return { created: 0, duplicates: 0, next: [] };
  }

  if (campaign.discoveryCursor === CURSOR_DONE) {
    logger.info({ campaignId }, "all lead sources exhausted for this campaign");
    return { created: 0, duplicates: 0, next: [], exhausted: true };
  }
  const existingCount = await prisma.lead.count({ where: { campaignId } });
  // Each run adds at most one batch, and never beyond the campaign's total cap.
  let remaining = Math.min(DISCOVERY_BATCH_SIZE, campaign.maxLeads - existingCount);
  let pageToken: string | null = campaign.discoveryCursor;
  let exhausted = false;
  let created = 0;
  let duplicates = 0;
  const next: NextAction[] = [];
  let pages = 0;

  while (remaining > 0 && pages < 20) {
    pages++;
    const res = await provider.searchBusinesses({
      category: campaign.category,
      country: campaign.country,
      region: campaign.region,
      city: campaign.city,
      // Never request more than we can store, so resuming from the cursor skips nothing.
      limit: remaining,
      pageToken,
    });
    for (const f of (res as { failed?: string[] }).failed ?? []) failedSources.add(f);

    for (const b of res.businesses) {
      if (remaining <= 0) break;
      const existing = await findExisting(b);
      if (existing) {
        duplicates++;
        await enrichExisting(existing, b);
        continue;
      }
      const email = normalizeEmail(b.email);
      const suppressed = email ? await prisma.suppressionEntry.findUnique({ where: { email } }) : null;
      const lead = await prisma.lead.create({
        data: {
          campaignId,
          businessName: b.businessName,
          normalizedName: normalizeBusinessName(b.businessName),
          category: b.category,
          address: b.address,
          normalizedAddress: normalizeAddress(b.address),
          city: b.city,
          region: b.region,
          country: b.country,
          phone: b.phone,
          email,
          websiteUrl: b.websiteUrl,
          domain: extractDomain(b.websiteUrl),
          source: b.source,
          sourceExternalId: b.sourceExternalId,
          sourceUrl: b.sourceUrl ?? null,
          sourceVerified: b.sourceVerified ?? null,
          sources: [b.source],
          rating: b.rating,
          reviewCount: b.reviewCount,
          description: b.description,
          latitude: b.latitude,
          longitude: b.longitude,
          socialLinks: b.socialLinks ?? undefined,
          doNotContact: Boolean(suppressed),
          status: suppressed ? "suppressed" : "discovered",
        },
      });
      await leadEvent(lead.id, "discovered", `Discovered via ${b.source}${b.sourceVerified === false ? " (source page could not be verified)" : ""}`, { campaignId, sourceUrl: b.sourceUrl ?? null });
      created++;
      remaining--;
      if (!suppressed) next.push({ queue: "website-analysis", payload: { leadId: lead.id } });
    }

    pageToken = res.nextPageToken;
    if (!pageToken) {
      exhausted = true;
      break;
    }
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { discoveryCursor: exhausted ? CURSOR_DONE : pageToken } });

  if (failedSources.size) {
    await audit({ action: "discovery.source_failed", entityType: "campaign", entityId: campaignId, metadata: { failed: [...failedSources] } });
  }
  logger.info({ campaignId, created, duplicates, exhausted, provider: provider.name, failedSources: [...failedSources] }, "lead discovery batch finished");
  return { created, duplicates, next, exhausted };
}
