import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { getAIProvider } from "@/providers/ai";
import { ClaudeCodeProvider } from "@/providers/ai/ClaudeCodeProvider";
import { sourceAvailability } from "@/providers/leads";
import { MARKET_RESEARCH_SYSTEM, MarketResearchSchema, marketResearchPrompt, type MarketResearch, type MarketResearchFacts } from "@/prompts/autopilot";
import type { NextAction } from "@/queue/queues";
import { generateJsonCached } from "@/services/ai-analysis/aiClient";
import { getSettings } from "@/services/compliance/settings";
import { CURSOR_DONE } from "@/services/lead-discovery/discoveryService";
import { matchTemplateByKeyword } from "@/templates/registry";

/** Business types that have a website template, so every lead can get a preview. */
export const AUTOPILOT_CATEGORIES = ["construction", "restaurant", "cafe", "hotel", "salon", "gym", "dentist", "event venue", "real estate", "professional services"];

export const marketKey = (m: { country: string; region?: string | null; city?: string | null; category: string }) =>
  [m.country, m.region ?? "", m.city ?? "", m.category].join("|").toLowerCase();

export interface AutopilotSummary {
  enabled: boolean;
  created?: string | null;
  continued: number;
  completed: number;
  note?: string;
}

/** Asks Claude (with web search when available) which market to target next. */
export async function researchNextMarket(facts: MarketResearchFacts): Promise<MarketResearch> {
  const system = MARKET_RESEARCH_SYSTEM;
  const prompt = marketResearchPrompt(facts);
  const ai = getAIProvider();
  if (ai instanceof ClaudeCodeProvider) {
    const res = await ai.generateJson(
      { system, prompt, schema: MarketResearchSchema, schemaName: "market_research", tier: "large", maxTokens: 4000 },
      { tools: ["WebSearch"], timeoutMs: 420_000 },
    );
    return res.data;
  }
  // Research is time-dependent, so the response cache is bypassed.
  return (await generateJsonCached({ system, prompt, schema: MarketResearchSchema, schemaName: "market_research", tier: "large", maxTokens: 4000 }, { bypassCache: true })).data;
}

/** Keeps the researched category on one with a template; falls back to the first allowed one. */
function resolveCategory(category: string, allowed: string[]): string | null {
  const pool = allowed.length ? allowed : AUTOPILOT_CATEGORIES;
  const exact = pool.find((c) => c.toLowerCase() === category.toLowerCase());
  if (exact) return exact;
  const template = matchTemplateByKeyword(category);
  return template ? category : null;
}

async function researchAndCreateCampaign(): Promise<{ id: string; name: string } | null> {
  const settings = await getSettings("autopilot");
  const previous = await prisma.campaign.findMany({
    where: { autopilot: true },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { _count: { select: { leads: true } } },
  });
  const stats = await Promise.all(
    previous.map(async (c) => ({
      country: c.country,
      region: c.region,
      city: c.city,
      category: c.category,
      leads: c._count.leads,
      emailsSent: await prisma.outreachMessage.count({ where: { campaignId: c.id, status: "sent" } }),
      replies: await prisma.lead.count({ where: { campaignId: c.id, status: { in: ["replied", "interested", "converted"] } } }),
    })),
  );
  const excluded = previous.map(marketKey);
  const facts: MarketResearchFacts = {
    supportedCategories: AUTOPILOT_CATEGORIES,
    allowedCountries: settings.allowedCountries,
    allowedCategories: settings.allowedCategories,
    history: stats.slice(0, 15),
    excluded,
  };

  // One retry if the research hands back a market that was already used or isn't usable.
  let market: MarketResearch | null = null;
  for (let attempt = 0; attempt < 2 && !market; attempt++) {
    const found = await researchNextMarket(facts);
    const category = resolveCategory(found.category, settings.allowedCategories);
    const countryOk = !settings.allowedCountries.length || settings.allowedCountries.some((c) => c.toLowerCase() === found.country.toLowerCase());
    if (!category || !countryOk) {
      logger.warn({ found }, "autopilot research returned an unusable market");
      continue;
    }
    const candidate = { ...found, category };
    if (excluded.includes(marketKey(candidate))) {
      facts.excluded = [...facts.excluded, marketKey(candidate)];
      continue;
    }
    market = candidate;
  }
  if (!market) return null;

  // Prefer sources that return phone/email/website; otherwise the env default sources are used.
  const preferred = ["apify_google_maps", "google_places"].filter((s) => sourceAvailability(s).ok);
  const place = [market.city, market.region, market.country].filter(Boolean).join(", ");
  const campaign = await prisma.campaign.create({
    data: {
      name: `Autopilot: ${market.category} · ${place}`.slice(0, 120),
      category: market.category,
      country: market.country,
      region: market.region,
      city: market.city,
      status: "running",
      startedAt: new Date(),
      maxLeads: settings.leadsPerCampaign,
      dailyEmailLimit: settings.dailyEmailLimit,
      autoSendEnabled: true,
      autoGeneratePreview: true,
      autoGenerateDrafts: true,
      callMode: "off",
      leadSources: preferred.length ? [...preferred, "openstreetmap"] : [],
      autopilot: true,
      researchNotes: market.rationale,
    },
  });
  await audit({ action: "autopilot.campaign_created", entityType: "campaign", entityId: campaign.id, metadata: { market, name: campaign.name } });
  return { id: campaign.id, name: campaign.name };
}

/**
 * One Autopilot pass (runs hourly): keeps running Autopilot campaigns discovering until
 * they are full, completes finished ones, and researches a new market when it is time.
 */
export async function runAutopilotCycle(now = new Date()): Promise<{ next: NextAction[]; summary: AutopilotSummary }> {
  const settings = await getSettings("autopilot");
  const summary: AutopilotSummary = { enabled: settings.enabled, continued: 0, completed: 0 };
  if (!settings.enabled) return { next: [], summary };

  const compliance = await getSettings("compliance");
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.outreachMessage.count({ where: { status: "sent", sentAt: { gte: startOfDay } } });
  const sendingRoom = sentToday < compliance.maxEmailsPerDay;

  const next: NextAction[] = [];
  const running = await prisma.campaign.findMany({ where: { autopilot: true, status: "running" }, include: { _count: { select: { leads: true } } } });

  for (const c of running) {
    const full = c.discoveryCursor === CURSOR_DONE || c._count.leads >= c.maxLeads;
    const inFlight = await prisma.job.count({ where: { campaignId: c.id, type: "lead-discovery", status: { in: ["queued", "processing"] } } });
    if (full) {
      // Done once no pipeline step for its leads is still waiting.
      const leadIds = (await prisma.lead.findMany({ where: { campaignId: c.id }, select: { id: true } })).map((l) => l.id);
      const busy = await prisma.job.count({ where: { leadId: { in: leadIds }, status: { in: ["queued", "processing"] } } });
      if (!inFlight && !busy) {
        await prisma.campaign.update({ where: { id: c.id }, data: { status: "completed" } });
        await audit({ action: "autopilot.campaign_completed", entityType: "campaign", entityId: c.id });
        summary.completed++;
      }
    } else if (!inFlight && sendingRoom) {
      next.push({ queue: "lead-discovery", payload: { campaignId: c.id } });
      summary.continued++;
    }
  }

  const stillRunning = running.length - summary.completed;
  if (stillRunning === 0) {
    const last = await prisma.campaign.findFirst({ where: { autopilot: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const dueAt = last ? last.createdAt.getTime() + settings.newCampaignEveryHours * 3_600_000 : 0;
    if (now.getTime() >= dueAt) {
      const created = await researchAndCreateCampaign();
      if (created) {
        next.push({ queue: "lead-discovery", payload: { campaignId: created.id } });
        summary.created = created.name;
      } else {
        summary.note = "Research found no new usable market";
      }
    }
  }
  logger.info({ ...summary }, "autopilot cycle finished");
  return { next, summary };
}
