/**
 * Autopilot against a real PostgreSQL database (TEST_DATABASE_URL) with the mock AI provider.
 */
import { describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("autopilot", async () => {
  const { prisma } = await import("@/lib/db");
  const { setAIProviderForTests } = await import("@/providers/ai");
  const { MockAIProvider } = await import("@/providers/ai/MockAIProvider");
  const { saveSettings } = await import("@/services/compliance/settings");
  const { runAutopilotCycle } = await import("@/services/autopilot/autopilotService");

  it("does nothing while disabled", async () => {
    setAIProviderForTests(new MockAIProvider());
    await prisma.$executeRawUnsafe(`TRUNCATE campaigns, leads, jobs, audit_logs, settings, ai_cache CASCADE`);
    const res = await runAutopilotCycle();
    expect(res.next).toEqual([]);
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("researches a market, launches an auto-sending campaign, and picks a different market next time", async () => {
    await saveSettings("autopilot", { enabled: true, newCampaignEveryHours: 1, leadsPerCampaign: 10 });
    const first = await runAutopilotCycle();
    const c1 = await prisma.campaign.findFirstOrThrow({ where: { autopilot: true } });
    expect(c1).toMatchObject({ status: "running", autoSendEnabled: true, autoGeneratePreview: true, callMode: "off", maxLeads: 10 });
    expect(c1.researchNotes).toBeTruthy();
    expect(first.next).toEqual([{ queue: "lead-discovery", payload: { campaignId: c1.id } }]);

    // A running campaign that still has room is continued, not duplicated.
    const again = await runAutopilotCycle();
    expect(await prisma.campaign.count()).toBe(1);
    expect(again.next).toEqual([{ queue: "lead-discovery", payload: { campaignId: c1.id } }]);

    // Once it is full and idle it completes, and (after the interval) the next market differs.
    await prisma.campaign.update({ where: { id: c1.id }, data: { discoveryCursor: "done", createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    const third = await runAutopilotCycle();
    expect(third.summary.completed).toBe(1);
    const c2 = await prisma.campaign.findFirstOrThrow({ where: { autopilot: true, id: { not: c1.id } } });
    expect([c2.country, c2.city]).not.toEqual([c1.country, c1.city]);
  });
});
