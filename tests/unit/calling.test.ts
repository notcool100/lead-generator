import { describe, expect, it } from "vitest";
import { toE164 } from "@/lib/phone";
import { formatMonthlyPrice } from "@/lib/offer";
import { australianNationalHolidays, easterSunday, marketForCountry } from "@/lib/call-markets";
import { outcomeFromDisconnection } from "@/prompts/cold-call";
import { signRetellBody, verifyRetellSignature } from "@/providers/calling/RetellClient";
import { callDecision, inCallingWindow, nextCallingWindow, type CallDecisionInput } from "@/services/calling/rules";
import { CallingSettingsSchema } from "@/services/compliance/settings";

const settings = CallingSettingsSchema.parse({ timezone: "America/New_York", startHour: 10, endHour: 17, days: [1, 2, 3, 4, 5], maxCallsPerDay: 5, maxAttemptsPerLead: 2, retryAfterHours: 48 });
// Wednesday 2026-10-07 14:00 in New York (18:00 UTC)
const WED_2PM = new Date("2026-10-07T18:00:00Z");

const base: CallDecisionInput = {
  trigger: "auto",
  now: WED_2PM,
  settings,
  campaignCallMode: "auto",
  campaignDailyLimit: 10,
  market: "us",
  dncChecked: true,
  lead: { phoneE164: "+12125550123", doNotContact: false, lastCallOutcome: null, status: "preview_ready" },
  attempts: 0,
  activeCall: false,
  lastCallAt: null,
  callsLast24h: 0,
  campaignCallsLast24h: 0,
};

describe("phone normalisation", () => {
  it("keeps international numbers and converts national ones with a known country", () => {
    expect(toE164("+1 (212) 555-0123", "Nepal")).toBe("+12125550123");
    expect(toE164("(212) 555-0123", "United States")).toBe("+12125550123");
    expect(toE164("020 7946 0958", "United Kingdom")).toBe("+442079460958");
    expect(toE164("0044 20 7946 0958", null)).toBe("+442079460958");
    expect(toE164("061-123456", "Nepal")).toBe("+97761123456");
  });
  it("refuses to guess when the country is unknown", () => {
    expect(toE164("555 0123 456", "Atlantis")).toBeNull();
    expect(toE164("", "United States")).toBeNull();
  });
});

describe("offer price", () => {
  it("formats the monthly price", () => {
    expect(formatMonthlyPrice({ monthlyPrice: 110, currency: "USD" })).toBe("$110/month");
    expect(formatMonthlyPrice({ monthlyPrice: 99.5, currency: "EUR" })).toBe("€99.50/month");
    expect(formatMonthlyPrice({ monthlyPrice: 110, currency: "ZZZZ" })).toBe("ZZZZ 110/month");
  });
});

describe("calling rules", () => {
  it("allows an automatic call inside the window", () => {
    expect(callDecision(base)).toEqual({ ok: true });
  });
  it("detects calling hours in the configured timezone", () => {
    expect(inCallingWindow(WED_2PM, settings)).toBe(true);
    expect(inCallingWindow(new Date("2026-10-07T12:00:00Z"), settings)).toBe(false); // 08:00 NY
    expect(inCallingWindow(new Date("2026-10-10T18:00:00Z"), settings)).toBe(false); // Saturday
  });
  it("defers automatic calls outside hours to the next window, refuses manual ones", () => {
    const evening = new Date("2026-10-09T23:00:00Z"); // Friday 19:00 NY
    const auto = callDecision({ ...base, now: evening });
    expect(auto.ok).toBe(false);
    if (!auto.ok && !auto.permanent) expect(auto.retryAt.toISOString()).toBe("2026-10-12T14:00:00.000Z"); // Monday 10:00 NY
    else throw new Error("expected a deferral");
    const manual = callDecision({ ...base, now: evening, trigger: "manual" });
    expect(manual).toMatchObject({ ok: false, permanent: true });
    expect(nextCallingWindow(evening, { ...settings, days: [] })).toBeNull();
  });
  it("never calls do-not-contact, wrong numbers or leads without a valid number", () => {
    expect(callDecision({ ...base, lead: { ...base.lead, doNotContact: true } })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, trigger: "manual", lead: { ...base.lead, lastCallOutcome: "do_not_contact" } })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, trigger: "manual", lead: { ...base.lead, lastCallOutcome: "wrong_number" } })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, lead: { ...base.lead, phoneE164: null } })).toMatchObject({ ok: false, permanent: true });
  });
  it("respects campaign call mode", () => {
    expect(callDecision({ ...base, campaignCallMode: "off", trigger: "manual" })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, campaignCallMode: "manual" })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, campaignCallMode: "manual", trigger: "manual" })).toEqual({ ok: true });
    expect(callDecision({ ...base, campaignCallMode: null, trigger: "manual" })).toEqual({ ok: true });
  });
  it("stops automatic calls once a person was reached, but allows a manual follow-up", () => {
    const reached = { ...base, lead: { ...base.lead, lastCallOutcome: "callback_requested" } };
    expect(callDecision(reached)).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...reached, trigger: "manual" })).toEqual({ ok: true });
  });
  it("enforces attempts, spacing between attempts and daily limits", () => {
    expect(callDecision({ ...base, trigger: "retry", attempts: 2 })).toMatchObject({ ok: false, permanent: true });
    const spaced = callDecision({ ...base, trigger: "retry", attempts: 1, lastCallAt: new Date(WED_2PM.getTime() - 3_600_000) });
    expect(spaced).toMatchObject({ ok: false, permanent: false });
    expect(callDecision({ ...base, callsLast24h: 5 })).toMatchObject({ ok: false, permanent: false });
    expect(callDecision({ ...base, campaignCallsLast24h: 10, trigger: "manual" })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, activeCall: true, trigger: "manual" })).toMatchObject({ ok: false, permanent: true });
  });
});

describe("country calling rules", () => {
  const au = CallingSettingsSchema.parse({ timezone: "Australia/Sydney", startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] });
  const at = (iso: string) => ({ ...base, trigger: "manual" as const, market: "au" as const, settings: au, now: new Date(iso) });

  it("knows Easter and Australian national public holidays", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    expect([...australianNationalHolidays(2027)]).toEqual(expect.arrayContaining(["01-26", "03-26", "03-29", "04-25", "12-25"]));
  });
  it("applies Australia's legal hours on top of the operator's hours", () => {
    // Sydney is UTC+11 in October/November (daylight saving)
    expect(callDecision(at("2026-11-04T08:30:00Z"))).toEqual({ ok: true }); // Wed 19:30
    expect(callDecision(at("2026-11-04T09:30:00Z"))).toMatchObject({ ok: false }); // Wed 20:30
    expect(callDecision(at("2026-11-07T05:00:00Z"))).toEqual({ ok: true }); // Sat 16:00
    expect(callDecision(at("2026-11-07T06:30:00Z"))).toMatchObject({ ok: false }); // Sat 17:30
    expect(callDecision(at("2026-11-08T01:00:00Z"))).toMatchObject({ ok: false }); // Sunday noon
    expect(callDecision(at("2026-12-25T01:00:00Z"))).toMatchObject({ ok: false }); // Christmas Day
  });
  it("defers automatic AU calls on Sunday to Monday 9am", () => {
    const d = callDecision({ ...at("2026-11-08T01:00:00Z"), trigger: "auto" });
    if (d.ok || d.permanent) throw new Error("expected a deferral");
    expect(d.retryAt.toISOString()).toBe("2026-11-08T22:00:00.000Z"); // Mon 09:00 Sydney
  });
  it("requires the Do Not Call register check where one exists", () => {
    expect(callDecision({ ...at("2026-11-04T01:00:00Z"), dncChecked: false })).toMatchObject({ ok: false, permanent: true });
    expect(callDecision({ ...base, market: "us", dncChecked: false })).toEqual({ ok: true });
  });
  it("guesses the market from the lead's country", () => {
    expect(marketForCountry("Australia")).toBe("au");
    expect(marketForCountry("United Kingdom")).toBe("uk");
    expect(marketForCountry("United States")).toBe("us");
  });
});

describe("retell webhooks", () => {
  it("verifies signatures over the raw body and rejects tampering or stale timestamps", () => {
    const body = JSON.stringify({ event: "call_ended", call: { call_id: "abc" } });
    const now = Date.now();
    const sig = signRetellBody(body, "key_123", now);
    expect(verifyRetellSignature(body, sig, "key_123", now)).toBe(true);
    expect(verifyRetellSignature(body + " ", sig, "key_123", now)).toBe(false);
    expect(verifyRetellSignature(body, sig, "other_key", now)).toBe(false);
    expect(verifyRetellSignature(body, sig, "key_123", now + 6 * 60_000)).toBe(false);
    expect(verifyRetellSignature(body, null, "key_123")).toBe(false);
    expect(verifyRetellSignature(body, "garbage", "key_123")).toBe(false);
  });
  it("maps unanswered calls to outcomes", () => {
    expect(outcomeFromDisconnection("dial_no_answer")).toBe("no_answer");
    expect(outcomeFromDisconnection("voicemail_reached")).toBe("voicemail");
    expect(outcomeFromDisconnection("invalid_destination")).toBe("wrong_number");
    expect(outcomeFromDisconnection("user_hangup")).toBeNull();
  });
});
