import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAIProvider } from "@/providers/ai";
import type { GenerateJsonRequest, GenerateJsonResult } from "@/providers/ai/AIProvider";
// Registers offline fallbacks for every schema.
import "@/prompts/business-analysis";
import "@/prompts/website-content";
import "@/prompts/outreach";

/**
 * Wraps the provider with a Postgres-backed response cache keyed by
 * (provider, model, schema, system, prompt). Identical inputs are never paid twice.
 */
export async function generateJsonCached<T>(req: GenerateJsonRequest<T>, opts: { bypassCache?: boolean } = {}): Promise<GenerateJsonResult<T> & { cached: boolean; cacheKey: string }> {
  const provider = getAIProvider();
  const model = provider.modelFor(req.tier);
  const cacheKey = createHash("sha256").update([provider.name, model, req.schemaName, req.system, req.prompt].join("\u0000")).digest("hex");

  if (!opts.bypassCache) {
    const hit = await prisma.aiCache.findUnique({ where: { key: cacheKey } });
    if (hit) {
      const parsed = req.schema.safeParse(hit.response);
      if (parsed.success) return { data: parsed.data, provider: provider.name, model, raw: hit.response, cached: true, cacheKey };
    }
  }

  const started = Date.now();
  const result = await provider.generateJson(req);
  logger.info({ provider: result.provider, model: result.model, schema: req.schemaName, ms: Date.now() - started, usage: result.usage }, "ai call");

  await prisma.aiCache.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, model, response: result.data as Prisma.InputJsonValue },
    update: { response: result.data as Prisma.InputJsonValue, model },
  });
  return { ...result, cached: false, cacheKey };
}
