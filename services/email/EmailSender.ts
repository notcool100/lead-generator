import { prisma } from "@/lib/db";
import { audit, leadEvent } from "@/lib/audit";
import { env } from "@/lib/env";
import { getEmailProvider, type EmailProvider } from "@/providers/email";
import { isReservedDomain } from "@/providers/email/EmailProvider";
import { checkEligibility } from "@/services/compliance/rules";
import { getSettings, type ComplianceSettings } from "@/services/compliance/settings";
import { isSuppressed } from "@/services/compliance/suppression";
import { createUnsubscribeToken, unsubscribeUrl } from "@/services/compliance/unsubscribe";
import { scheduleNextFollowup } from "@/services/followups/followupService";

export class SendDeferredError extends Error {
  constructor(message: string, public readonly retryAfterMs: number) {
    super(message);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildFooter(settings: ComplianceSettings, unsubUrl: string | null) {
  const lines = [
    settings.footerText,
    [settings.businessName, settings.businessAddress].filter(Boolean).join(" · "),
    unsubUrl ? `Unsubscribe: ${unsubUrl}` : 'To opt out, reply "unsubscribe".',
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderEmailBodies(body: string, footer: string) {
  const text = `${body}\n\n--\n${footer}`;
  const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px">${body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px"><p style="font-size:12px;color:#6b7280;margin:0">${linkify(footer).replace(/\n/g, "<br>")}</p></div>`;
  return { text, html };
}

async function sendCounts(campaignId: string | null, domain: string) {
  const now = Date.now();
  const hourAgo = new Date(now - 3_600_000);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const sent = { status: "sent" as const };
  const [sentLastHour, sentToday, campaignSentToday, domainSentToday, last] = await Promise.all([
    prisma.outreachMessage.count({ where: { ...sent, sentAt: { gte: hourAgo } } }),
    prisma.outreachMessage.count({ where: { ...sent, sentAt: { gte: dayStart } } }),
    campaignId ? prisma.outreachMessage.count({ where: { ...sent, campaignId, sentAt: { gte: dayStart } } }) : 0,
    prisma.outreachMessage.count({ where: { ...sent, sentAt: { gte: dayStart }, toEmail: { endsWith: `@${domain}` } } }),
    prisma.outreachMessage.findFirst({ where: sent, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  return { counts: { sentLastHour, sentToday, campaignSentToday, domainSentToday }, lastSentAt: last?.sentAt ?? null };
}

/**
 * Sends one approved message after re-checking every compliance rule.
 * Throws SendDeferredError when a rate limit applies (the worker re-delays the job).
 */
export async function sendOutreachMessage(messageId: string, provider: EmailProvider = getEmailProvider()) {
  const msg = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId }, include: { lead: true, campaign: true } });
  if (msg.status === "sent") return { skipped: "already sent" };
  const lead = msg.lead;
  if (msg.campaign && ["paused", "archived"].includes(msg.campaign.status)) {
    await prisma.outreachMessage.update({ where: { id: messageId }, data: { status: "queued", error: `Campaign is ${msg.campaign.status}` } });
    throw new SendDeferredError(`Campaign is ${msg.campaign.status}`, 3_600_000);
  }
  const settings = await getSettings("compliance");
  const toEmail = msg.toEmail ?? lead.email;
  const domain = toEmail?.split("@")[1] ?? "";
  const suppressed = toEmail ? await isSuppressed(toEmail, msg.campaignId) : { global: false, campaign: false };
  const badEvents = await prisma.emailEvent.count({
    where: { eventType: { in: ["bounced", "complained"] }, outreachMessage: { leadId: lead.id } },
  });
  const { counts, lastSentAt } = await sendCounts(msg.campaignId, domain);

  const decision = checkEligibility({
    lead: { doNotContact: lead.doNotContact, unsubscribed: lead.unsubscribed, status: lead.status },
    toEmail,
    message: { status: msg.status, sequenceNumber: msg.sequenceNumber },
    globallySuppressed: suppressed.global,
    campaignSuppressed: suppressed.campaign,
    hasBounceOrComplaint: badEvents > 0,
    counts,
    lastSentAt,
    limits: {
      maxEmailsPerHour: settings.maxEmailsPerHour,
      maxEmailsPerDay: settings.maxEmailsPerDay,
      campaignDailyLimit: msg.campaign?.dailyEmailLimit ?? null,
      maxEmailsPerDomainPerDay: settings.maxEmailsPerDomainPerDay,
      minDelaySeconds: settings.minDelaySeconds,
      maxFollowups: settings.maxFollowups,
    },
    targetCountries: settings.targetCountries,
    leadCountry: lead.country,
    reservedDomain: provider.name !== "log" && Boolean(toEmail && isReservedDomain(toEmail)),
  });

  if (!decision.allowed) {
    if (!decision.permanent) {
      await prisma.outreachMessage.update({ where: { id: messageId }, data: { status: "queued", error: decision.reason } });
      throw new SendDeferredError(decision.reason, decision.retryAfterMs);
    }
    await prisma.outreachMessage.update({ where: { id: messageId }, data: { status: "cancelled", error: decision.reason } });
    await leadEvent(lead.id, "send_blocked", `Email not sent: ${decision.reason}`);
    await audit({ action: "email.blocked", entityType: "outreach_message", entityId: messageId, metadata: { reason: decision.reason } });
    return { skipped: decision.reason };
  }

  const token = createUnsubscribeToken({ email: toEmail!, leadId: lead.id, campaignId: msg.campaignId });
  const unsub = settings.unsubscribeMechanism === "reply_only" ? null : unsubscribeUrl(token);
  const { text, html } = renderEmailBodies(msg.body, buildFooter(settings, unsub));
  const e = env();
  const headers: Record<string, string> = {};
  if (settings.unsubscribeMechanism === "link_and_header" && unsub) {
    headers["List-Unsubscribe"] = `<${e.APP_URL.replace(/\/$/, "")}/api/unsubscribe?token=${token}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const from = settings.senderEmail ? `${settings.senderName} <${settings.senderEmail}>` : e.EMAIL_FROM;

  try {
    const result = await provider.send({
      to: toEmail!,
      from,
      replyTo: settings.replyTo || e.EMAIL_REPLY_TO,
      subject: msg.subject,
      text,
      html,
      headers,
      tag: msg.id,
    });
    const sentAt = new Date();
    await prisma.outreachMessage.update({ where: { id: messageId }, data: { status: "sent", sentAt, messageId: result.providerMessageId, provider: provider.name, error: null } });
    await prisma.emailEvent.create({ data: { outreachMessageId: messageId, eventType: "sent", metadata: { provider: provider.name } } });
    if (!["replied", "interested", "converted"].includes(lead.status)) await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
    await leadEvent(lead.id, "email_sent", msg.sequenceNumber === 0 ? `Email sent: "${msg.subject}"` : `Follow-up #${msg.sequenceNumber} sent`);
    await audit({ action: "email.sent", entityType: "outreach_message", entityId: messageId, metadata: { provider: provider.name } });
    await scheduleNextFollowup(messageId);
    return { sent: true, providerMessageId: result.providerMessageId };
  } catch (err) {
    await prisma.outreachMessage.update({ where: { id: messageId }, data: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}
