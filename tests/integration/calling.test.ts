/**
 * AI calling against a real PostgreSQL database (TEST_DATABASE_URL) with a fake
 * Retell client: place call → webhooks → outcome → lead pipeline.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("AI cold calling", async () => {
  const { prisma } = await import("@/lib/db");
  const { RetellClient } = await import("@/providers/calling/RetellClient");
  const { placeCall, handleRetellEvent, setRetellClientForTests, CallNotAllowedError } = await import("@/services/calling/callService");
  const { saveSettings } = await import("@/services/compliance/settings");
  const { getQueue } = await import("@/queue/queues");

  class FakeRetell extends RetellClient {
    calls: { toNumber: string; dynamicVariables?: Record<string, string> }[] = [];
    constructor() {
      super("test-key");
    }
    override async createPhoneCall(p: { fromNumber: string; toNumber: string; dynamicVariables?: Record<string, string> }) {
      this.calls.push(p);
      return { call_id: `rc_${this.calls.length}`, call_status: "registered" as const, telephony_identifier: { twilio_call_sid: `CA${this.calls.length}` } };
    }
  }
  const retell = new FakeRetell();
  // Calling window is 24/7 in these tests; real time keeps DB timestamps and rule checks consistent.
  const now = new Date();
  let campaignId: string;

  async function makeLead(phone: string | null, extra: Record<string, unknown> = {}) {
    const lead = await prisma.lead.create({
      data: {
        campaignId, businessName: `Biz ${Math.random().toString(36).slice(2, 7)}`, normalizedName: "biz", category: "plumber", country: "United States", city: "Austin",
        phone, email: "owner@biz.test", source: "mock", websiteStatus: "no_website", status: "preview_ready", ...extra,
      },
    });
    return lead;
  }

  beforeAll(async () => {
    setRetellClientForTests(retell);
    await prisma.$executeRawUnsafe(`TRUNCATE campaigns, leads, calls, suppression_list, jobs, audit_logs, settings CASCADE`);
    await saveSettings("calling", { timezone: "UTC", startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6], maxCallsPerDay: 50, maxAttemptsPerLead: 2, retryAfterHours: 24 });
    await saveSettings("compliance", { senderName: "Sam", businessName: "Studio" });
    const c = await prisma.campaign.create({ data: { name: "Calls", category: "plumber", country: "United States", city: "Austin", status: "running", callMode: "auto", dailyCallLimit: 10 } });
    campaignId = c.id;
  });
  afterAll(async () => {
    setRetellClientForTests(null);
    // Don't leave delayed retry jobs from this test in the shared Redis queue.
    for (const j of await getQueue("call-place").getDelayed()) await j.remove();
    await prisma.$disconnect();
  });

  it("places a call with the monthly offer and records the Retell ids", async () => {
    const lead = await makeLead("(512) 555-0100");
    const { callId } = await placeCall(lead.id, { trigger: "manual", now });
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call).toMatchObject({ retellCallId: "rc_1", twilioCallSid: "CA1", toNumber: "+15125550100", status: "registered", trigger: "manual" });
    const vars = retell.calls.at(-1)!.dynamicVariables!;
    expect(vars.monthly_price).toBe("$110 per month");
    expect(vars.company_name).toBe("Studio");
    expect(vars.observation).toBe(""); // no website check performed → no claims

    // A second call while the first is in progress is refused.
    await expect(placeCall(lead.id, { trigger: "manual", now })).rejects.toBeInstanceOf(CallNotAllowedError);
  });

  it("stores transcript and outcome from webhooks and moves the lead to interested", async () => {
    const call = await prisma.call.findFirstOrThrow({ where: { retellCallId: "rc_1" } });
    await handleRetellEvent({ event: "call_started", call: { call_id: "rc_1", call_status: "ongoing", start_timestamp: now.getTime() } });
    await handleRetellEvent({
      event: "call_ended",
      call: { call_id: "rc_1", call_status: "ended", end_timestamp: now.getTime() + 90_000, duration_ms: 90_000, transcript: "Agent: Hi\nUser: Sure, send it over", recording_url: "https://rec.example/1.wav", disconnection_reason: "agent_hangup" },
    });
    const analyzed = {
      event: "call_analyzed",
      call: {
        call_id: "rc_1", call_status: "ended" as const, disconnection_reason: "agent_hangup",
        call_analysis: { call_summary: "Owner wants the preview by email.", user_sentiment: "Positive", custom_analysis_data: { outcome: "interested", confirmed_email: "owner@biz.test" } },
        call_cost: { combined_cost: 12.5 },
      },
    };
    await handleRetellEvent(analyzed);
    await handleRetellEvent(analyzed); // Retell retries are idempotent

    const after = await prisma.call.findUniqueOrThrow({ where: { id: call.id }, include: { lead: true } });
    expect(after).toMatchObject({ status: "ended", outcome: "interested", durationMs: 90_000, summary: "Owner wants the preview by email.", costCents: 12.5 });
    expect(after.transcript).toContain("send it over");
    expect(after.lead).toMatchObject({ status: "interested", lastCallOutcome: "interested" });
    expect(await prisma.leadEvent.count({ where: { leadId: after.leadId, type: "call_outcome" } })).toBe(1);
  });

  it("schedules one retry after no answer in auto mode", async () => {
    const lead = await makeLead("+1 512 555 0101");
    const { callId } = await placeCall(lead.id, { trigger: "auto", now });
    const rc = (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).retellCallId!;
    await handleRetellEvent({ event: "call_ended", call: { call_id: rc, call_status: "not_connected", disconnection_reason: "dial_no_answer" } });
    await handleRetellEvent({ event: "call_analyzed", call: { call_id: rc, call_status: "not_connected", disconnection_reason: "dial_no_answer", call_analysis: { custom_analysis_data: { outcome: "no_answer" } } } });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).lastCallOutcome).toBe("no_answer");
    expect(await prisma.job.count({ where: { type: "call-place", leadId: lead.id } })).toBe(1);
    // The retry is refused until the spacing has passed.
    await expect(placeCall(lead.id, { trigger: "retry", now: new Date(now.getTime() + 3_600_000) })).rejects.toMatchObject({ permanent: false });
  });

  it("suppresses the lead when they ask not to be called", async () => {
    const lead = await makeLead("+1 512 555 0102");
    const { callId } = await placeCall(lead.id, { trigger: "manual", now });
    const rc = (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).retellCallId!;
    await handleRetellEvent({ event: "call_analyzed", call: { call_id: rc, call_status: "ended", call_analysis: { custom_analysis_data: { outcome: "do_not_contact" } } } });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l).toMatchObject({ doNotContact: true, status: "suppressed", lastCallOutcome: "do_not_contact" });
    await expect(placeCall(lead.id, { trigger: "manual", now: new Date(now.getTime() + 86_400_000) })).rejects.toMatchObject({ permanent: true });
  });

  it("refuses leads without a usable number and respects campaign call mode", async () => {
    const noPhone = await makeLead(null);
    await expect(placeCall(noPhone.id, { trigger: "manual", now })).rejects.toBeInstanceOf(CallNotAllowedError);
    await prisma.campaign.update({ where: { id: campaignId }, data: { callMode: "manual" } });
    const lead = await makeLead("+1 512 555 0103");
    await expect(placeCall(lead.id, { trigger: "auto", now })).rejects.toMatchObject({ permanent: true });
    await expect(placeCall(lead.id, { trigger: "manual", now })).resolves.toHaveProperty("callId");
  });
});
