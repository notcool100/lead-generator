import { CALL_MARKETS, legalCallWindow, type CallMarketKey } from "@/lib/call-markets";
import type { CallingSettings } from "@/services/compliance/settings";

/**
 * Pure call-permission rules — unit tested. Every call, manual or automatic,
 * passes through `callDecision` before anything is dialled.
 */
export type CallTrigger = "manual" | "auto" | "retry";

export interface CallDecisionInput {
  trigger: CallTrigger;
  now: Date;
  settings: CallingSettings;
  campaignCallMode: "off" | "manual" | "auto" | null;
  campaignDailyLimit: number | null;
  /** Country rule set (legal hours, Do Not Call register). */
  market: CallMarketKey;
  /** The campaign's numbers were checked against the market's Do Not Call register. */
  dncChecked: boolean;
  lead: { phoneE164: string | null; doNotContact: boolean; lastCallOutcome: string | null; status: string };
  /** Calls already placed for this lead (any status except cancelled). */
  attempts: number;
  /** A call for this lead is queued/ringing/in progress. */
  activeCall: boolean;
  lastCallAt: Date | null;
  callsLast24h: number;
  campaignCallsLast24h: number;
  /** Most recent call placed to anyone (spaces out automatic calls). */
  lastAnyCallAt?: Date | null;
}

/** Minimum gap between automatic calls, so a queue doesn't all dial the moment calling hours open. */
export const AUTO_CALL_GAP_MS = 2 * 60_000;

export type CallDecision =
  | { ok: true }
  | { ok: false; reason: string; permanent: true }
  | { ok: false; reason: string; permanent: false; retryAt: Date };

/** Outcomes after which we never call again. */
const NEVER_AGAIN = new Set(["do_not_contact", "wrong_number"]);
/** Outcomes after which automatic calls stop (a person may still call manually). */
const AUTO_STOP = new Set(["interested", "not_interested", "appointment_booked", "callback_requested"]);
const AUTO_STOP_STATUSES = new Set(["replied", "interested", "not_interested", "converted", "suppressed"]);

export type WindowSettings = Pick<CallingSettings, "timezone" | "startHour" | "endHour" | "days">;

/** Local date/time parts in an IANA timezone. Invalid zones fall back to UTC. */
export function localTime(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).formatToParts(date);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")) % 24, minute: Number(get("minute")), weekday };
}

/** Inside the operator's calling hours AND the market's legal window (both in the campaign's timezone). */
export function inCallingWindow(date: Date, s: WindowSettings, market: CallMarketKey = "us") {
  const t = localTime(date, s.timezone);
  return s.days.includes(t.weekday) && t.hour >= s.startHour && t.hour < s.endHour && legalCallWindow(market, t);
}

/** Start of the next calling window (15-minute resolution, searched up to 8 days ahead). */
export function nextCallingWindow(from: Date, s: WindowSettings, market: CallMarketKey = "us"): Date | null {
  const step = 15 * 60_000;
  let t = Math.ceil(from.getTime() / step) * step;
  for (let i = 0; i < (8 * 24 * 60) / 15; i++, t += step) {
    if (inCallingWindow(new Date(t), s, market)) return new Date(t);
  }
  return null;
}

export function callDecision(i: CallDecisionInput): CallDecision {
  const s = i.settings;
  const automatic = i.trigger !== "manual";
  if (!i.lead.phoneE164) return { ok: false, permanent: true, reason: "No valid phone number for this lead (needs an international number or a known country)" };
  if (i.lead.doNotContact) return { ok: false, permanent: true, reason: "Lead is marked do-not-contact" };
  if (i.lead.lastCallOutcome && NEVER_AGAIN.has(i.lead.lastCallOutcome))
    return { ok: false, permanent: true, reason: `Last call outcome was "${i.lead.lastCallOutcome.replace(/_/g, " ")}" — not calling again` };
  if (i.campaignCallMode === "off") return { ok: false, permanent: true, reason: "Calling is turned off for this campaign" };
  const dnc = CALL_MARKETS[i.market].dncRegister;
  if (dnc && !i.dncChecked) return { ok: false, permanent: true, reason: `Check this campaign's numbers against the ${dnc.name} first, then click “Mark as checked” on the campaign (needed again after new leads are found)` };
  if (automatic && i.campaignCallMode !== "auto") return { ok: false, permanent: true, reason: "Campaign is not set to call automatically" };
  if (automatic && i.lead.lastCallOutcome && AUTO_STOP.has(i.lead.lastCallOutcome))
    return { ok: false, permanent: true, reason: `Already reached this lead (${i.lead.lastCallOutcome.replace(/_/g, " ")}) — follow up manually` };
  if (automatic && AUTO_STOP_STATUSES.has(i.lead.status)) return { ok: false, permanent: true, reason: `Lead is ${i.lead.status.replace(/_/g, " ")}` };
  if (automatic && i.attempts >= s.maxAttemptsPerLead) return { ok: false, permanent: true, reason: `Reached ${s.maxAttemptsPerLead} call attempts for this lead` };
  if (i.activeCall) return { ok: false, permanent: true, reason: "A call to this lead is already in progress" };

  if (automatic && i.lastCallAt) {
    const earliest = new Date(i.lastCallAt.getTime() + s.retryAfterHours * 3_600_000);
    if (earliest > i.now) return { ok: false, permanent: false, reason: `Waiting ${s.retryAfterHours}h between attempts`, retryAt: earliest };
  }

  if (!inCallingWindow(i.now, s, i.market)) {
    const next = nextCallingWindow(i.now, s, i.market);
    if (!next) return { ok: false, permanent: true, reason: "No calling days configured in Settings → Calling" };
    if (!automatic)
      return { ok: false, permanent: true, reason: `Outside calling hours (${s.startHour}:00–${s.endHour}:00 ${s.timezone}; legal: ${CALL_MARKETS[i.market].legalHours})` };
    return { ok: false, permanent: false, reason: "Outside calling hours", retryAt: next };
  }

  if (automatic && i.lastAnyCallAt && i.now.getTime() - i.lastAnyCallAt.getTime() < AUTO_CALL_GAP_MS) {
    return { ok: false, permanent: false, reason: "Spacing out automatic calls", retryAt: new Date(i.lastAnyCallAt.getTime() + AUTO_CALL_GAP_MS) };
  }

  const tomorrow = new Date(i.now.getTime() + 3_600_000 * 3);
  if (i.callsLast24h >= s.maxCallsPerDay) {
    if (!automatic) return { ok: false, permanent: true, reason: `Daily call limit reached (${s.maxCallsPerDay})` };
    return { ok: false, permanent: false, reason: "Daily call limit reached", retryAt: tomorrow };
  }
  if (i.campaignDailyLimit != null && i.campaignCallsLast24h >= i.campaignDailyLimit) {
    if (!automatic) return { ok: false, permanent: true, reason: `Campaign daily call limit reached (${i.campaignDailyLimit})` };
    return { ok: false, permanent: false, reason: "Campaign daily call limit reached", retryAt: tomorrow };
  }
  return { ok: true };
}
