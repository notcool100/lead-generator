import { prisma, type Prisma, type WebsiteStatus } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { extractDomain, normalizeEmail } from "@/lib/normalize";
import { humanize } from "@/lib/utils";
import type { NextAction } from "@/queue/queues";
import { getSettings } from "@/services/compliance/settings";
import { findFacebookEmail } from "@/services/enrichment/facebookEmail";
import { scoreLead } from "@/services/scoring/leadScore";
import { WebsiteAnalyzer } from "./WebsiteAnalyzer";

export function qualifies(params: {
  websiteStatus: WebsiteStatus;
  leadScore: number;
  targetStatuses: WebsiteStatus[];
  minScore: number;
  doNotContact: boolean;
}) {
  if (params.doNotContact) return { qualified: false, reason: "Lead is marked do-not-contact" };
  if (!params.targetStatuses.includes(params.websiteStatus))
    return { qualified: false, reason: `Website status "${humanize(params.websiteStatus)}" is not targeted by this campaign` };
  if (params.leadScore < params.minScore) return { qualified: false, reason: `Lead score ${params.leadScore} below minimum ${params.minScore}` };
  return { qualified: true, reason: "Matches campaign website criteria and minimum score" };
}

export async function runWebsiteCheck(leadId: string, analyzer?: WebsiteAnalyzer): Promise<{ next: NextAction[] }> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
  const general = await getSettings("general");
  const a = analyzer ?? new WebsiteAnalyzer({ domainDiscovery: general.domainDiscoveryEnabled });
  const result = await a.analyze({
    businessName: lead.businessName,
    city: lead.city,
    country: lead.country,
    websiteUrl: lead.websiteUrl,
    source: lead.source,
  });

  await prisma.websiteCheck.create({
    data: {
      leadId,
      url: result.url,
      finalUrl: result.finalUrl,
      reachable: result.reachable,
      statusCode: result.statusCode,
      responseTime: result.responseTimeMs,
      sslValid: result.sslValid,
      mobileFriendly: result.signals ? result.signals.hasViewport : null,
      hasContactInformation: result.signals?.hasContactInformation ?? null,
      hasMenu: result.signals?.hasMenu ?? null,
      hasBooking: result.signals?.hasBooking ?? null,
      hasSocialLinks: result.signals ? Object.keys(result.signals.socialLinks).length > 0 : null,
      hasClearCta: result.signals?.hasClearCta ?? null,
      contentScore: result.score?.contentScore ?? null,
      designScore: result.score?.designScore ?? null,
      technicalScore: result.score?.technicalScore ?? null,
      overallScore: result.score?.overallScore ?? null,
      websiteStatus: result.status,
      reasons: result.reasons,
      metadata: {
        discovered: result.discovered,
        candidatesTried: result.candidatesTried,
        title: result.signals?.title ?? null,
        metaDescription: result.signals?.metaDescription ?? null,
        copyrightYear: result.signals?.copyrightYear ?? null,
        outdatedSignals: result.score?.outdatedSignals ?? [],
        band: result.score?.band ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  // Enrich from the business's own site (publicly published contact details only).
  const siteEmail = !lead.email ? normalizeEmail(result.signals?.emails.find((e) => !e.endsWith(".png") && !e.includes("sentry")) ?? null) : null;
  const social = { ...((lead.socialLinks as Record<string, string> | null) ?? {}), ...(result.signals?.socialLinks ?? {}) };
  const websiteUrl = result.discovered ? result.finalUrl : lead.websiteUrl;
  const campaign = lead.campaign;
  const targetStatuses = campaign?.targetWebsiteStatuses ?? ["no_website", "poor_website", "outdated"];

  // No email on the site (or no site at all): try the business's Facebook page — paid, so only for targeted leads.
  let facebookEmail: string | null = null;
  const e = env();
  if (!lead.email && !siteEmail && !lead.doNotContact && targetStatuses.includes(result.status) && e.APIFY_API_TOKEN && e.APIFY_FACEBOOK_ENRICHMENT === "true") {
    try {
      const fb = await findFacebookEmail(e.APIFY_API_TOKEN, { businessName: lead.businessName, city: lead.city, country: lead.country, facebookUrl: social.facebook });
      facebookEmail = fb.email;
      if (fb.facebookUrl && !social.facebook) social.facebook = fb.facebookUrl;
    } catch (err) {
      logger.warn({ leadId, err: err instanceof Error ? err.message : err }, "facebook email lookup failed");
    }
  }
  const email = lead.email ?? siteEmail ?? facebookEmail;

  const { score } = scoreLead({
    websiteStatus: result.status,
    email,
    phone: lead.phone,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    address: lead.address,
    hasSocial: Object.keys(social).length > 0,
  });

  const q = qualifies({
    websiteStatus: result.status,
    leadScore: score,
    targetStatuses,
    minScore: campaign?.minLeadScore ?? general.qualifyMinScore,
    doNotContact: lead.doNotContact,
  });

  // Only early-stage leads are (re)qualified; later stages keep their pipeline status.
  const earlyStage = ["discovered", "qualified", "rejected"].includes(lead.status);
  const nextStatus = lead.doNotContact ? "suppressed" : earlyStage ? (q.qualified ? "qualified" : "rejected") : lead.status;
  const statusChanged = lead.websiteStatus !== "unknown" && lead.websiteStatus !== result.status;
  if (statusChanged || (!earlyStage && !q.qualified)) {
    // Unsent drafts may contain observations that are no longer true — never send them.
    const cancelled = await prisma.outreachMessage.updateMany({
      where: { leadId, status: { in: ["draft", "approved", "queued"] } },
      data: { status: "cancelled", error: "Website re-check changed the verified facts; regenerate the draft" },
    });
    if (cancelled.count) await leadEvent(leadId, "outreach_invalidated", `${cancelled.count} unsent draft(s) cancelled after website status changed`);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      websiteStatus: result.status,
      websiteStatusReasons: result.reasons,
      websiteUrl,
      domain: extractDomain(websiteUrl),
      email,
      socialLinks: Object.keys(social).length ? social : undefined,
      leadScore: score,
      status: nextStatus,
    },
  });
  await leadEvent(leadId, "website_checked", `Website: ${humanize(result.status)} — ${q.qualified ? "qualified" : "not qualified"} (${q.reason})`, {
    score: result.score?.overallScore ?? null,
    leadScore: score,
  });
  if (siteEmail) await leadEvent(leadId, "enriched", `Contact email found on the business's website`);
  if (facebookEmail) await leadEvent(leadId, "enriched", `Contact email found on the business's Facebook page`, { facebookUrl: social.facebook ?? null });

  return { next: q.qualified && earlyStage && !lead.doNotContact ? [{ queue: "ai-analysis", payload: { leadId } }] : [] };
}
