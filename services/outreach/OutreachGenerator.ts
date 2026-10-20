import { prisma } from "@/lib/db";
import { audit, leadEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { deterministicEmail, lintOutreachEmail, OUTREACH_SYSTEM, OutreachEmailSchema, outreachPrompt, type OutreachFacts } from "@/prompts/outreach";
import type { NextAction } from "@/queue/queues";
import { generateJsonCached } from "@/services/ai-analysis/aiClient";
import { formatMonthlyPrice } from "@/lib/offer";
import { getSettings } from "@/services/compliance/settings";
import { matchTemplateByKeyword } from "@/templates/registry";
import { buildVerifiedObservations } from "./observations";

export class OutreachNotPossibleError extends Error {}

/** Creates an outreach draft (initial or follow-up) grounded only in verified observations. */
export async function generateOutreachDraft(
  leadId: string,
  opts: { sequenceNumber?: number; followupId?: string; regenerate?: boolean; userId?: string } = {},
): Promise<{ messageId: string; next: NextAction[] }> {
  const seq = opts.sequenceNumber ?? 0;
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      campaign: true,
      websiteChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      previews: { where: { deploymentStatus: "deployed" }, orderBy: { updatedAt: "desc" }, take: 1 },
      outreachMessages: { where: { sequenceNumber: 0 }, orderBy: { createdAt: "desc" }, take: 1 },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (lead.doNotContact || lead.unsubscribed) throw new OutreachNotPossibleError("Lead is do-not-contact / unsubscribed");
  if (!lead.email) throw new OutreachNotPossibleError("Lead has no email address");
  const preview = lead.previews[0];
  if (!preview?.deploymentUrl) throw new OutreachNotPossibleError("No deployed preview for this lead yet");

  const [compliance, general, offer] = await Promise.all([getSettings("compliance"), getSettings("general"), getSettings("offer")]);
  // Industrial / construction companies get the shared Summit demo instead of their own generated preview.
  const industrial = matchTemplateByKeyword(lead.category) === "construction";
  const previewUrl = industrial ? offer.industrialDemoUrl : preview.deploymentUrl;
  const check = lead.websiteChecks[0];
  const price = formatMonthlyPrice(offer);
  const packageFeatures = (lead.analyses[0]?.packageFeatures as string[] | null) ?? [];

  const facts: OutreachFacts = {
    businessName: lead.businessName,
    recipientName: null,
    category: lead.category,
    city: lead.city,
    verifiedObservations: buildVerifiedObservations({
      businessName: lead.businessName,
      websiteStatus: lead.websiteStatus,
      websiteUrl: lead.websiteUrl,
      reasons: lead.websiteStatusReasons,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      checkPerformed: Boolean(check),
      mobileFriendly: check?.mobileFriendly ?? null,
      hasBooking: check?.hasBooking ?? null,
      hasMenu: check?.hasMenu ?? null,
      category: lead.category,
    }),
    senderName: compliance.senderName,
    senderCompany: compliance.businessName || null,
    sequenceNumber: seq,
    previousSubject: lead.outreachMessages[0]?.subject ?? null,
    templateSubject: general.defaultEmailTemplate.subject,
    templateIntro: general.defaultEmailTemplate.intro,
    offer: { price, includes: offer.includes },
    onlyDirectoryListings: lead.websiteStatus === "no_website",
    demoIsExample: industrial,
    // Business-specific extras are the interesting ones; core features are covered by offer.includes.
    relevantFeatures: packageFeatures.filter((f) => !/website|hosting|mobile|seo|analytics|notification|contact information/i.test(f)).slice(0, 4),
  };

  let email = deterministicEmail(facts);
  let provider = "template";
  try {
    const res = await generateJsonCached(
      { system: OUTREACH_SYSTEM, prompt: outreachPrompt(facts), schema: OutreachEmailSchema, schemaName: "outreach_email", tier: "large", maxTokens: 2000 },
      { bypassCache: opts.regenerate },
    );
    const problems = lintOutreachEmail(res.data, { price, sequenceNumber: seq });
    if (problems.length) {
      logger.warn({ leadId, problems }, "AI outreach draft rejected by honesty lint; using template");
    } else {
      email = res.data;
      provider = `${res.provider}:${res.model}`;
    }
  } catch (err) {
    logger.warn({ err, leadId }, "AI outreach generation failed; using template");
  }

  const body = email.body.replace(/\{\{\s*preview_url\s*\}\}/g, previewUrl);

  // Replace an existing unsent draft rather than piling up duplicates.
  const existingDraft = await prisma.outreachMessage.findFirst({ where: { leadId, sequenceNumber: seq, status: "draft" } });
  const message = existingDraft
    ? await prisma.outreachMessage.update({ where: { id: existingDraft.id }, data: { subject: email.subject, body, provider, toEmail: lead.email } })
    : await prisma.outreachMessage.create({
        data: { leadId, campaignId: lead.campaignId, sequenceNumber: seq, toEmail: lead.email, subject: email.subject, body, provider, status: "draft" },
      });

  if (opts.followupId) await prisma.followup.update({ where: { id: opts.followupId }, data: { status: "drafted" } });
  if (seq === 0 && ["preview_ready", "analyzed", "qualified"].includes(lead.status)) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "outreach_draft" } });
  }
  await leadEvent(leadId, "outreach_drafted", seq === 0 ? `Outreach draft created (${provider})` : `Follow-up #${seq} draft created`);
  await audit({ userId: opts.userId, action: opts.regenerate ? "outreach.regenerate" : "outreach.draft", entityType: "outreach_message", entityId: message.id });

  // Auto-send when the campaign opted in AND (global approval is off OR the campaign runs on autopilot).
  // Autopilot campaigns are fully hands-off, so they send without the manual approval step.
  const autoSend = Boolean(lead.campaign?.autoSendEnabled) && (!compliance.requireApproval || Boolean(lead.campaign?.autopilot));
  if (autoSend) {
    await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: "approved", approvedAt: new Date() } });
    await audit({ action: "outreach.auto_approve", entityType: "outreach_message", entityId: message.id });
    return { messageId: message.id, next: [{ queue: "email-send", payload: { messageId: message.id } }] };
  }
  return { messageId: message.id, next: [] };
}
