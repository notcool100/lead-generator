/**
 * Pure compliance rules — the single place that decides whether an email may
 * be sent right now. Unit tested; used by the email-send worker.
 */
export interface EligibilityContext {
  lead: { doNotContact: boolean; unsubscribed: boolean; status: string };
  toEmail: string | null;
  message: { status: string; sequenceNumber: number };
  globallySuppressed: boolean;
  campaignSuppressed: boolean;
  hasBounceOrComplaint: boolean;
  counts: { sentLastHour: number; sentToday: number; campaignSentToday: number; domainSentToday: number };
  lastSentAt: Date | null;
  limits: {
    maxEmailsPerHour: number;
    maxEmailsPerDay: number;
    campaignDailyLimit: number | null;
    maxEmailsPerDomainPerDay: number;
    minDelaySeconds: number;
    maxFollowups: number;
  };
  targetCountries: string[];
  leadCountry: string;
  reservedDomain: boolean;
  now?: Date;
}

export type Eligibility =
  | { allowed: true }
  | { allowed: false; permanent: true; reason: string }
  | { allowed: false; permanent: false; reason: string; retryAfterMs: number };

const STOP_STATUSES = new Set(["replied", "interested", "not_interested", "converted", "suppressed", "rejected"]);

export function checkEligibility(ctx: EligibilityContext): Eligibility {
  const now = ctx.now ?? new Date();
  const perm = (reason: string): Eligibility => ({ allowed: false, permanent: true, reason });
  const wait = (reason: string, retryAfterMs: number): Eligibility => ({ allowed: false, permanent: false, reason, retryAfterMs: Math.max(1000, retryAfterMs) });

  if (!ctx.toEmail) return perm("Lead has no email address");
  if (ctx.lead.doNotContact) return perm("Lead is marked do_not_contact");
  if (ctx.lead.unsubscribed) return perm("Lead has unsubscribed");
  if (ctx.globallySuppressed) return perm("Email is on the global suppression list");
  if (ctx.campaignSuppressed) return perm("Email is on the campaign suppression list");
  if (ctx.hasBounceOrComplaint) return perm("A previous email bounced or received a complaint");
  if (ctx.reservedDomain) return perm("Recipient uses a reserved/example domain (sample data)");
  if (ctx.message.sequenceNumber > 0 && STOP_STATUSES.has(ctx.lead.status)) return perm(`Sequence stopped: lead status is ${ctx.lead.status}`);
  if (ctx.message.sequenceNumber > ctx.limits.maxFollowups) return perm("Maximum follow-ups reached");
  if (!["approved", "queued"].includes(ctx.message.status)) return perm(`Message status is ${ctx.message.status}, not approved`);
  if (ctx.targetCountries.length && !ctx.targetCountries.map((c) => c.toLowerCase()).includes(ctx.leadCountry.toLowerCase()))
    return perm(`Country ${ctx.leadCountry} is not in the allowed target countries`);

  const msToNextHour = 3_600_000 - (now.getTime() % 3_600_000);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(24, 0, 0, 0);
  const msToTomorrow = endOfDay.getTime() - now.getTime();

  if (ctx.limits.maxEmailsPerDay === 0 || ctx.limits.maxEmailsPerHour === 0) return wait("Sending is disabled (limit set to 0)", 3_600_000);
  if (ctx.counts.sentToday >= ctx.limits.maxEmailsPerDay) return wait("Daily sending limit reached", msToTomorrow);
  if (ctx.limits.campaignDailyLimit != null && ctx.counts.campaignSentToday >= ctx.limits.campaignDailyLimit) return wait("Campaign daily limit reached", msToTomorrow);
  if (ctx.counts.domainSentToday >= ctx.limits.maxEmailsPerDomainPerDay) return wait("Per-domain daily limit reached", msToTomorrow);
  if (ctx.counts.sentLastHour >= ctx.limits.maxEmailsPerHour) return wait("Hourly sending limit reached", msToNextHour);
  if (ctx.lastSentAt) {
    const since = now.getTime() - ctx.lastSentAt.getTime();
    const min = ctx.limits.minDelaySeconds * 1000;
    if (since < min) return wait("Minimum delay between emails not yet elapsed", min - since);
  }
  return { allowed: true };
}

/** Follow-up sequences stop on reply, unsubscribe, bounce, complaint or do-not-contact. */
export function shouldStopSequence(i: {
  leadStatus: string;
  unsubscribed: boolean;
  doNotContact: boolean;
  suppressed: boolean;
  eventTypes: string[];
}): { stop: boolean; reason: string | null } {
  if (i.unsubscribed) return { stop: true, reason: "unsubscribed" };
  if (i.doNotContact) return { stop: true, reason: "do_not_contact" };
  if (i.suppressed) return { stop: true, reason: "suppressed" };
  for (const t of ["replied", "unsubscribed", "bounced", "complained"]) {
    if (i.eventTypes.includes(t)) return { stop: true, reason: t };
  }
  if (STOP_STATUSES.has(i.leadStatus)) return { stop: true, reason: `lead ${i.leadStatus}` };
  return { stop: false, reason: null };
}
