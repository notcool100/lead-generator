import { prisma } from "@/lib/db";
import { audit, leadEvent } from "@/lib/audit";
import { normalizeEmail } from "@/lib/normalize";

/**
 * Adds an email to the global suppression list and immediately stops every
 * pending message / follow-up for leads with that email.
 */
export async function suppressEmail(rawEmail: string, reason: string, source: string, userId?: string | null) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Invalid email");
  await prisma.suppressionEntry.upsert({ where: { email }, create: { email, reason, source }, update: { reason, source } });
  const leads = await prisma.lead.findMany({ where: { email }, select: { id: true } });
  await stopLeads(leads.map((l) => l.id), { unsubscribed: reason === "unsubscribed", reason });
  await audit({ userId, action: "suppression.add", entityType: "suppression", entityId: email, metadata: { reason, source } });
  return { email, leadsAffected: leads.length };
}

export async function suppressLead(leadId: string, reason: string, userId?: string | null) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.email) await suppressEmail(lead.email, reason, "manual", userId);
  else await stopLeads([leadId], { unsubscribed: false, reason });
  await audit({ userId, action: "lead.suppress", entityType: "lead", entityId: leadId, metadata: { reason } });
}

async function stopLeads(leadIds: string[], opts: { unsubscribed: boolean; reason: string }) {
  if (!leadIds.length) return;
  await prisma.lead.updateMany({
    where: { id: { in: leadIds } },
    data: { doNotContact: true, status: "suppressed", ...(opts.unsubscribed ? { unsubscribed: true, emailConsentStatus: "unsubscribed" } : {}) },
  });
  await prisma.followup.updateMany({ where: { leadId: { in: leadIds }, status: { in: ["scheduled", "drafted"] } }, data: { status: "cancelled", reason: opts.reason } });
  await prisma.outreachMessage.updateMany({ where: { leadId: { in: leadIds }, status: { in: ["draft", "approved", "queued"] } }, data: { status: "cancelled", error: `Cancelled: ${opts.reason}` } });
  for (const id of leadIds) await leadEvent(id, "suppressed", `Lead suppressed (${opts.reason}) — all pending outreach cancelled`);
}

export async function isSuppressed(email: string, campaignId?: string | null) {
  const e = normalizeEmail(email);
  if (!e) return { global: false, campaign: false };
  const [g, c] = await Promise.all([
    prisma.suppressionEntry.findUnique({ where: { email: e } }),
    campaignId ? prisma.campaignSuppression.findUnique({ where: { campaignId_email: { campaignId, email: e } } }) : null,
  ]);
  return { global: Boolean(g), campaign: Boolean(c) };
}
