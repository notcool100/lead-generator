import { describe, expect, it } from "vitest";
import { checkEligibility, shouldStopSequence, type EligibilityContext } from "@/services/compliance/rules";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/services/compliance/unsubscribe";
import { scoreLead } from "@/services/scoring/leadScore";
import { qualifies } from "@/services/website-analysis/websiteCheckService";

const now = new Date("2026-09-25T12:30:00Z");
const ctx = (over: Partial<EligibilityContext> = {}): EligibilityContext => ({
  lead: { doNotContact: false, unsubscribed: false, status: "approved" },
  toEmail: "hi@luna.pt",
  message: { status: "approved", sequenceNumber: 0 },
  globallySuppressed: false,
  campaignSuppressed: false,
  hasBounceOrComplaint: false,
  counts: { sentLastHour: 0, sentToday: 0, campaignSentToday: 0, domainSentToday: 0 },
  lastSentAt: null,
  limits: { maxEmailsPerHour: 10, maxEmailsPerDay: 50, campaignDailyLimit: 20, maxEmailsPerDomainPerDay: 2, minDelaySeconds: 90, maxFollowups: 2 },
  targetCountries: [],
  leadCountry: "Portugal",
  reservedDomain: false,
  now,
  ...over,
});

describe("suppression rules", () => {
  it("allows a clean approved message", () => expect(checkEligibility(ctx()).allowed).toBe(true));
  it.each([
    ["do_not_contact", { lead: { doNotContact: true, unsubscribed: false, status: "approved" } }],
    ["unsubscribed", { lead: { doNotContact: false, unsubscribed: true, status: "approved" } }],
    ["global suppression", { globallySuppressed: true }],
    ["campaign suppression", { campaignSuppressed: true }],
    ["bounce / complaint", { hasBounceOrComplaint: true }],
    ["no email", { toEmail: null }],
    ["not approved", { message: { status: "draft", sequenceNumber: 0 } }],
    ["reserved domain", { reservedDomain: true }],
    ["country not targeted", { targetCountries: ["Spain"] }],
  ] as const)("permanently blocks: %s", (_n, over) => {
    const r = checkEligibility(ctx(over as Partial<EligibilityContext>));
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.permanent).toBe(true);
  });
});

describe("campaign limits and rate limiting", () => {
  const deferred = (over: Partial<EligibilityContext>) => {
    const r = checkEligibility(ctx(over));
    return r.allowed === false && !r.permanent ? r : null;
  };
  it("defers when the global daily limit is reached until tomorrow", () => {
    const r = deferred({ counts: { sentLastHour: 0, sentToday: 50, campaignSentToday: 0, domainSentToday: 0 } });
    expect(r?.reason).toMatch(/Daily/);
    expect(r!.retryAfterMs).toBe(11.5 * 3_600_000);
  });
  it("defers on campaign daily limit", () => expect(deferred({ counts: { sentLastHour: 0, sentToday: 5, campaignSentToday: 20, domainSentToday: 0 } })?.reason).toMatch(/Campaign/));
  it("defers on per-domain limit", () => expect(deferred({ counts: { sentLastHour: 0, sentToday: 5, campaignSentToday: 1, domainSentToday: 2 } })?.reason).toMatch(/domain/));
  it("defers on hourly limit until the next hour", () => {
    const r = deferred({ counts: { sentLastHour: 10, sentToday: 10, campaignSentToday: 1, domainSentToday: 0 } });
    expect(r!.retryAfterMs).toBe(30 * 60_000);
  });
  it("enforces the minimum delay between emails", () => {
    const r = deferred({ lastSentAt: new Date(now.getTime() - 30_000) });
    expect(r!.retryAfterMs).toBe(60_000);
  });
  it("treats a 0 limit as sending disabled", () => expect(deferred({ limits: { ...ctx().limits, maxEmailsPerDay: 0 } })).not.toBeNull());
});

describe("follow-up stopping", () => {
  const base = { leadStatus: "contacted", unsubscribed: false, doNotContact: false, suppressed: false, eventTypes: ["sent", "delivered", "opened"] };
  it("continues a normal sequence", () => expect(shouldStopSequence(base).stop).toBe(false));
  it.each(["replied", "unsubscribed", "bounced", "complained"])("stops on %s event", (t) => {
    expect(shouldStopSequence({ ...base, eventTypes: [...base.eventTypes, t] })).toEqual({ stop: true, reason: t });
  });
  it("stops on unsubscribe flag, dnc, suppression and terminal statuses", () => {
    expect(shouldStopSequence({ ...base, unsubscribed: true }).stop).toBe(true);
    expect(shouldStopSequence({ ...base, doNotContact: true }).stop).toBe(true);
    expect(shouldStopSequence({ ...base, suppressed: true }).stop).toBe(true);
    expect(shouldStopSequence({ ...base, leadStatus: "interested" }).stop).toBe(true);
  });
  it("never sends a follow-up to a replied lead or beyond the maximum", () => {
    expect(checkEligibility(ctx({ lead: { doNotContact: false, unsubscribed: false, status: "replied" }, message: { status: "approved", sequenceNumber: 1 } })).allowed).toBe(false);
    expect(checkEligibility(ctx({ message: { status: "approved", sequenceNumber: 3 } })).allowed).toBe(false);
  });
});

describe("unsubscribe handling", () => {
  it("round-trips a signed token", () => {
    const t = createUnsubscribeToken({ email: "Hi@Luna.pt", leadId: "l1" });
    expect(verifyUnsubscribeToken(t)).toEqual({ email: "hi@luna.pt", leadId: "l1", campaignId: undefined });
  });
  it("rejects tampered tokens", () => {
    const t = createUnsubscribeToken({ email: "hi@luna.pt" });
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "victim@x.com" })).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${s}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${p}.AAAA`)).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("lead scoring and qualification", () => {
  it("scores no-website, contactable, well-reviewed leads highest", () => {
    const hi = scoreLead({ websiteStatus: "no_website", email: "a@b.c", phone: "1", rating: 4.8, reviewCount: 300, address: "x", hasSocial: true }).score;
    const lo = scoreLead({ websiteStatus: "excellent_website", email: null, phone: null, rating: null, reviewCount: null, address: null, hasSocial: false }).score;
    expect(hi).toBe(83);
    expect(lo).toBe(4);
  });
  it("adds points and readable factors for verified website deficiencies only", () => {
    const base = { email: null, phone: "1", rating: null, reviewCount: 40, address: null, hasSocial: true, category: "plumber" };
    const bad = scoreLead({ ...base, websiteStatus: "poor_website", mobileFriendly: false, hasClearCta: false, hasContactForm: false, mentionsServiceArea: false });
    const unchecked = scoreLead({ ...base, websiteStatus: "poor_website" });
    expect(bad.score - unchecked.score).toBe(15);
    expect(bad.factors).toEqual(expect.arrayContaining(["Website is not mobile-friendly", "No contact or quote form on the website", "Website doesn't state a service area"]));
    expect(unchecked.factors.join(" ")).not.toMatch(/mobile|form|service area/);
    // A restaurant isn't penalised for not listing a service area.
    expect(scoreLead({ ...base, category: "restaurant", websiteStatus: "poor_website", mentionsServiceArea: false }).factors.join(" ")).not.toMatch(/service area/);
  });
  it("qualifies only targeted website statuses above the min score", () => {
    const t = ["no_website", "poor_website"] as const;
    expect(qualifies({ websiteStatus: "no_website", leadScore: 60, targetStatuses: [...t], minScore: 50, doNotContact: false }).qualified).toBe(true);
    expect(qualifies({ websiteStatus: "good_website", leadScore: 90, targetStatuses: [...t], minScore: 50, doNotContact: false }).qualified).toBe(false);
    expect(qualifies({ websiteStatus: "no_website", leadScore: 40, targetStatuses: [...t], minScore: 50, doNotContact: false }).qualified).toBe(false);
    expect(qualifies({ websiteStatus: "no_website", leadScore: 90, targetStatuses: [...t], minScore: 50, doNotContact: true }).qualified).toBe(false);
  });
});
