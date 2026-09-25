import { logger } from "@/lib/logger";
import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import type { LeadProvider } from "./LeadProvider";

interface Token {
  i: number;
  t: string | null;
  failed: string[];
}

/**
 * Chains several providers (e.g. Google Places → OpenStreetMap → web search).
 * Each provider is exhausted in turn; a provider that fails is skipped (and
 * reported) instead of failing the whole discovery run.
 */
export class MultiLeadProvider implements LeadProvider {
  readonly name: string;
  constructor(private readonly providers: LeadProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult & { failed?: string[] }> {
    const tok: Token = q.pageToken ? (JSON.parse(q.pageToken) as Token) : { i: 0, t: null, failed: [] };
    while (tok.i < this.providers.length) {
      const p = this.providers[tok.i];
      try {
        const res = await p.searchBusinesses({ ...q, pageToken: tok.t });
        const next: Token = res.nextPageToken ? { i: tok.i, t: res.nextPageToken, failed: tok.failed } : { i: tok.i + 1, t: null, failed: tok.failed };
        const hasMore = next.i < this.providers.length;
        if (res.businesses.length || !hasMore) {
          return { businesses: res.businesses, nextPageToken: hasMore ? JSON.stringify(next) : null, failed: tok.failed };
        }
        Object.assign(tok, next);
      } catch (err) {
        logger.warn({ provider: p.name, err: err instanceof Error ? err.message : err }, "lead provider failed; continuing with next source");
        tok.failed = [...tok.failed, `${p.name}: ${err instanceof Error ? err.message : String(err)}`];
        tok.i += 1;
        tok.t = null;
      }
    }
    return { businesses: [], nextPageToken: null, failed: tok.failed };
  }

  async getBusiness(externalId: string): Promise<NormalizedBusiness | null> {
    for (const p of this.providers) {
      const b = await p.getBusiness(externalId).catch(() => null);
      if (b) return b;
    }
    return null;
  }
}
