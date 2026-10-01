import { prisma, type CallOutcome, type Prisma } from "@/lib/db";
import { audit, leadEvent } from "@/lib/audit";
import { CALL_MARKETS, marketForCountry } from "@/lib/call-markets";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatMonthlyPrice } from "@/lib/offer";
import { toE164 } from "@/lib/phone";
import { humanize } from "@/lib/utils";
import { isCallOutcome, outcomeFromDisconnection, type CallDynamicVariables } from "@/prompts/cold-call";
import { RetellClient, RetellError, type RetellCall, type RetellWebhookEvent } from "@/providers/calling/RetellClient";
import { enqueue } from "@/queue/queues";
import { getSettings } from "@/services/compliance/settings";
import { suppressLead } from "@/services/compliance/suppression";
import { stopSequenceForLead } from "@/services/followups/followupService";
import { buildVerifiedObservations } from "@/services/outreach/observations";
import { callDecision, type CallTrigger } from "./rules";

export class CallNotAllowedError extends Error {
  constructor(message: string, public readonly permanent: boolean, public readonly retryAfterMs = 0) {
    super(message);
  }
}

export function callingConfigured(): { ok: boolean; missing: string[] } {
  const e = env();
  const missing = [
    !e.RETELL_API_KEY && "RETELL_API_KEY",
    !e.RETELL_AGENT_ID && "RETELL_AGENT_ID",
    !e.RETELL_FROM_NUMBER && "RETELL_FROM_NUMBER",
  ].filter(Boolean) as string[];
  return { ok: missing.length === 0, missing };
}

const g = globalThis as unknown as { __retell?: RetellClient | null };
export function setRetellClientForTests(c: RetellClient | null) {
  g.__retell = c;
}
function retell(): RetellClient {
  if (g.__retell) return g.__retell;
  return new RetellClient(env().RETELL_API_KEY!);
}

const ACTIVE_STATUSES = ["queued", "registered", "ongoing"] as const;

/** Checks every rule, then asks Retell to dial. Throws CallNotAllowedError when a rule blocks the call. */
export async function placeCall(leadId: string, opts: { trigger: CallTrigger; userId?: string; now?: Date }) {
  const conf = callingConfigured();
  if (!conf.ok && !g.__retell) throw new CallNotAllowedError(`Calling is not configured (missing ${conf.missing.join(", ")})`, true);
  const now = opts.now ?? new Date();

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      campaign: true,
      websiteChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      previews: { where: { deploymentStatus: "deployed" }, orderBy: { updatedAt: "desc" }, take: 1 },
      calls: { where: { status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } },
    },
  });
  const [settings, compliance, offer] = await Promise.all([getSettings("calling"), getSettings("compliance"), getSettings("offer")]);
  const since = new Date(now.getTime() - 86_400_000);
  const [callsLast24h, campaignCallsLast24h, lastAnyCall] = await Promise.all([
    prisma.call.count({ where: { createdAt: { gte: since }, status: { not: "cancelled" } } }),
    lead.campaignId ? prisma.call.count({ where: { campaignId: lead.campaignId, createdAt: { gte: since }, status: { not: "cancelled" } } }) : 0,
    prisma.call.findFirst({ where: { status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const toNumber = toE164(lead.phone, lead.country);
  const market = lead.campaign?.callMarket ?? marketForCountry(lead.country);
  const marketInfo = CALL_MARKETS[market];
  const windowSettings = { ...settings, timezone: lead.campaign?.callTimezone || settings.timezone };

  const decision = callDecision({
    trigger: opts.trigger,
    now,
    settings: windowSettings,
    market,
    // Leads outside a campaign can only be called manually; the operator is responsible for the register check.
    // Leads found after the register check aren't covered by it.
    dncChecked: lead.campaign ? Boolean(lead.campaign.dncCheckedAt && lead.createdAt <= lead.campaign.dncCheckedAt) : true,
    campaignCallMode: lead.campaign?.callMode ?? null,
    campaignDailyLimit: lead.campaign?.dailyCallLimit ?? null,
    lead: { phoneE164: toNumber, doNotContact: lead.doNotContact, lastCallOutcome: lead.lastCallOutcome, status: lead.status },
    attempts: lead.calls.length,
    activeCall: lead.calls.some((c) => (ACTIVE_STATUSES as readonly string[]).includes(c.status) && now.getTime() - c.createdAt.getTime() < 2 * 3_600_000),
    lastCallAt: lead.calls[0]?.createdAt ?? null,
    callsLast24h,
    campaignCallsLast24h,
    lastAnyCallAt: lastAnyCall?.createdAt ?? null,
  });
  if (!decision.ok) {
    throw new CallNotAllowedError(decision.reason, decision.permanent, decision.permanent ? 0 : Math.max(60_000, decision.retryAt.getTime() - now.getTime()));
  }

  const preview = lead.previews[0];
  const check = lead.websiteChecks[0];
  const observation =
    buildVerifiedObservations({
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
    })[0] ?? "";

  const vars: CallDynamicVariables = {
    agent_name: settings.agentName,
    company_name: compliance.businessName || compliance.senderName,
    sender_name: compliance.senderName,
    business_name: lead.businessName,
    category: humanize(lead.category).toLowerCase(),
    city: lead.city ?? lead.region ?? lead.country,
    monthly_price: formatMonthlyPrice(offer).replace("/month", " per month"),
    offer_includes: offer.includes.join(", "),
    observation,
    preview_url: preview?.deploymentUrl ?? "",
    email_on_file: lead.email ?? "",
  };

  const fromNumber = env().RETELL_FROM_NUMBER ?? "";
  const call = await prisma.call.create({
    data: {
      leadId,
      campaignId: lead.campaignId,
      fromNumber,
      toNumber: toNumber!,
      trigger: opts.trigger,
      attempt: lead.calls.length + 1,
      initiatedById: opts.userId ?? null,
    },
  });

  try {
    const res = await retell().createPhoneCall({
      fromNumber,
      toNumber: toNumber!,
      agentId: env().RETELL_AGENT_ID,
      metadata: { callId: call.id, leadId },
      dynamicVariables: vars as unknown as Record<string, string>,
      voiceId: lead.campaign?.callVoiceId || marketInfo.voices[0].id,
      language: marketInfo.language,
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { retellCallId: res.call_id, status: res.call_status === "ongoing" ? "ongoing" : "registered", twilioCallSid: res.telephony_identifier?.twilio_call_sid ?? null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.call.update({ where: { id: call.id }, data: { status: "error", error: msg.slice(0, 500) } });
    await leadEvent(leadId, "call_failed", `Call could not be placed: ${msg.slice(0, 200)}`);
    if (err instanceof RetellError && !err.transient) throw new CallNotAllowedError(msg, true);
    throw err;
  }

  await prisma.lead.update({ where: { id: leadId }, data: { lastCalledAt: now } });
  await leadEvent(leadId, "call_started", `${opts.trigger === "manual" ? "Manual" : opts.trigger === "retry" ? "Retry" : "Automatic"} AI call placed to ${toNumber}`);
  await audit({ userId: opts.userId, action: "call.place", entityType: "call", entityId: call.id, metadata: { leadId, trigger: opts.trigger } });
  return { callId: call.id };
}

/** Enqueues an automatic call when the lead's campaign is in auto mode. */
export async function autoCallIfEnabled(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { campaign: { select: { callMode: true } } } });
  if (!lead || lead.campaign?.callMode !== "auto" || !lead.phone || lead.doNotContact || !(callingConfigured().ok || g.__retell)) return [];
  return [{ queue: "call-place" as const, payload: { leadId, trigger: "auto" as const } }];
}

/**
 * Queues an automatic call for every lead in an auto campaign that is ready (phone, live preview)
 * and hasn't been called or queued yet. Used when a campaign is switched to Automatic or its
 * Do Not Call check is confirmed. Calls still wait for calling hours and limits at dial time.
 */
export async function queueAutoCalls(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { callMode: true } });
  if (campaign?.callMode !== "auto" || !(callingConfigured().ok || g.__retell)) return 0;
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      doNotContact: false,
      lastCallOutcome: null,
      status: { notIn: ["replied", "interested", "not_interested", "converted", "suppressed", "rejected"] },
      previews: { some: { deploymentStatus: "deployed" } },
      calls: { none: {} },
    },
    select: { id: true },
  });
  if (!leads.length) return 0;
  const pending = await prisma.job.findMany({
    where: { type: "call-place", status: { in: ["queued", "processing"] }, leadId: { in: leads.map((l) => l.id) } },
    select: { leadId: true },
  });
  const skip = new Set(pending.map((j) => j.leadId));
  let queued = 0;
  for (const l of leads) {
    if (skip.has(l.id)) continue;
    await enqueue("call-place", { leadId: l.id, trigger: "auto" });
    queued++;
  }
  return queued;
}

const STATUS_MAP: Record<RetellCall["call_status"], "registered" | "ongoing" | "ended" | "not_connected" | "error"> = {
  registered: "registered",
  ongoing: "ongoing",
  ended: "ended",
  not_connected: "not_connected",
  error: "error",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : null);

/** Handles a verified Retell webhook. Idempotent: events can be retried by Retell. */
export async function handleRetellEvent(evt: RetellWebhookEvent): Promise<{ handled: boolean; reason?: string }> {
  const rc = evt.call;
  if (!rc?.call_id) return { handled: false, reason: "no call id" };
  const metaId = typeof rc.metadata?.callId === "string" ? rc.metadata.callId : null;
  const call =
    (await prisma.call.findUnique({ where: { retellCallId: rc.call_id } })) ??
    (metaId ? await prisma.call.findUnique({ where: { id: metaId } }) : null);
  if (!call) return { handled: false, reason: "unknown call" };

  const data: Prisma.CallUpdateInput = {
    retellCallId: rc.call_id,
    status: STATUS_MAP[rc.call_status] ?? call.status,
  };
  if (rc.start_timestamp) data.startedAt = new Date(rc.start_timestamp);
  if (rc.end_timestamp) data.endedAt = new Date(rc.end_timestamp);
  if (rc.duration_ms != null) data.durationMs = Math.round(rc.duration_ms);
  if (rc.transcript) data.transcript = rc.transcript;
  if (rc.transcript_object) data.transcriptObject = rc.transcript_object as Prisma.InputJsonValue;
  if (rc.recording_url) data.recordingUrl = rc.recording_url;
  if (rc.disconnection_reason) data.disconnectionReason = rc.disconnection_reason;
  if (rc.telephony_identifier?.twilio_call_sid) data.twilioCallSid = rc.telephony_identifier.twilio_call_sid;
  if (rc.call_cost?.combined_cost != null) data.costCents = rc.call_cost.combined_cost;

  let outcome: CallOutcome | null = null;
  if (evt.event === "call_ended" || evt.event === "call_analyzed") outcome = outcomeFromDisconnection(rc.disconnection_reason);

  if (evt.event === "call_analyzed" && rc.call_analysis) {
    const a = rc.call_analysis;
    const custom = (a.custom_analysis_data ?? {}) as Record<string, unknown>;
    data.summary = str(a.call_summary);
    data.sentiment = str(a.user_sentiment);
    data.analysis = a as Prisma.InputJsonValue;
    data.callbackNote = str(custom.callback_time);
    if (isCallOutcome(custom.outcome)) outcome = custom.outcome;
    else if (a.in_voicemail) outcome = "voicemail";
    if (!outcome && call.outcome == null) outcome = "unknown";
  }

  await prisma.call.update({ where: { id: call.id }, data });
  if (evt.event === "call_started") await leadEvent(call.leadId, "call_connected", "AI call connected");
  if (outcome && outcome !== call.outcome) await applyOutcome(call.id, outcome, { firstOutcome: call.outcome == null });
  return { handled: true };
}

/** Records an outcome on the call and lead, and moves the pipeline accordingly. */
export async function applyOutcome(callId: string, outcome: CallOutcome, opts: { firstOutcome: boolean; userId?: string }) {
  const call = await prisma.call.update({ where: { id: callId }, data: { outcome }, include: { lead: { include: { campaign: true } } } });
  const lead = call.lead;
  await prisma.lead.update({ where: { id: lead.id }, data: { lastCallOutcome: outcome, lastCalledAt: call.createdAt } });
  const note = call.callbackNote ? ` — callback: ${call.callbackNote}` : "";
  await leadEvent(lead.id, "call_outcome", `Call outcome: ${humanize(outcome)}${note}`, { callId, summary: call.summary ?? null });

  const preContact = ["qualified", "analyzed", "preview_generating", "preview_ready", "outreach_draft", "approved", "contacted"].includes(lead.status);
  switch (outcome) {
    case "do_not_contact":
      await suppressLead(lead.id, "asked not to be contacted (phone)", opts.userId);
      break;
    case "interested":
    case "appointment_booked":
      if (preContact || lead.status === "replied") await prisma.lead.update({ where: { id: lead.id }, data: { status: "interested" } });
      await stopSequenceForLead(lead.id, `call outcome: ${outcome.replace(/_/g, " ")}`);
      break;
    case "not_interested":
      if (preContact || lead.status === "replied") await prisma.lead.update({ where: { id: lead.id }, data: { status: "not_interested" } });
      await stopSequenceForLead(lead.id, "said not interested on a call");
      break;
    case "callback_requested":
      if (preContact && lead.status !== "contacted") await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
      break;
    case "no_answer":
    case "voicemail": {
      // Automatic retry only once per call, only for auto campaigns; rules re-check limits at dial time.
      if (!opts.firstOutcome || lead.campaign?.callMode !== "auto") break;
      const settings = await getSettings("calling");
      const attempts = await prisma.call.count({ where: { leadId: lead.id, status: { not: "cancelled" } } });
      if (attempts < settings.maxAttemptsPerLead) {
        await enqueue("call-place", { leadId: lead.id, trigger: "retry" }, { delay: settings.retryAfterHours * 3_600_000 });
        await leadEvent(lead.id, "call_retry_scheduled", `No answer — retry scheduled in ${settings.retryAfterHours}h`);
      }
      break;
    }
    default:
      break;
  }
  logger.info({ callId, leadId: lead.id, outcome }, "call outcome recorded");
}
