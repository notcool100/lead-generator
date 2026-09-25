import { z } from "zod";
import { logger } from "@/lib/logger";
import { normalizeBusinessName, normalizeUrl } from "@/lib/normalize";
import type { ClaudeCodeProvider } from "@/providers/ai/ClaudeCodeProvider";
import { safeFetch } from "@/services/website-analysis/safeFetch";
import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import { LeadProviderError, type LeadProvider } from "./LeadProvider";

/**
 * Finds businesses anywhere on the web (map listings, directories, review sites,
 * social pages, local articles) using Claude's WebSearch tool via Claude Code.
 *
 * Anti-fabrication: every result must carry the URL it was found on. We fetch
 * that page; if it loads and does NOT mention the business, the result is
 * dropped. Pages that block bots are kept but flagged sourceVerified=false.
 */
const FoundSchema = z.object({
  businesses: z.array(
    z.object({
      name: z.string().min(1).max(160),
      address: z.string().max(300).nullable(),
      phone: z.string().max(60).nullable(),
      email: z.string().max(200).nullable(),
      officialWebsite: z.string().max(500).nullable(),
      socialProfile: z.string().max(500).nullable(),
      sourceUrl: z.string().min(8).max(1000),
      shortDescription: z.string().max(300).nullable(),
    }),
  ),
});

const SYSTEM = `You research real local businesses for a web design agency using web search.
Rules:
- Only return businesses you actually found in search results during this task. Never invent or guess a business.
- sourceUrl must be the exact page where you saw the business (Google Maps listing, TripAdvisor, Yelp, Facebook page, directory, news article, etc.).
- Copy name, address, phone and email exactly as published. Use null for anything you did not see.
- officialWebsite: only the business's own domain (not Facebook/Instagram/TripAdvisor/booking sites). null if none was found.
- Only currently operating businesses; skip ones marked permanently closed.
- Prefer small independent businesses; businesses without an official website or with an outdated one are especially relevant.`;

const MAX_PAGES = 4;
const PER_PAGE = 12;

interface Token {
  page: number;
  exclude: string[];
}

export class WebSearchLeadProvider implements LeadProvider {
  readonly name = "web_search";
  constructor(private readonly claude: ClaudeCodeProvider) {}

  private async verify(name: string, sourceUrl: string): Promise<boolean | "reject"> {
    try {
      const res = await safeFetch(sourceUrl, { timeoutMs: 12_000 });
      if (!res.ok) return false; // blocked (403/429) or login wall — cannot verify
      const words = normalizeBusinessName(name).split(" ").filter((w) => w.length > 2);
      const page = normalizeBusinessName(res.body.slice(0, 1_500_000));
      if (!words.length) return false;
      const hits = words.filter((w) => page.includes(w)).length;
      return hits / words.length >= 0.6 ? true : "reject";
    } catch {
      return false;
    }
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    const token: Token = q.pageToken ? (JSON.parse(q.pageToken) as Token) : { page: 0, exclude: [] };
    if (token.page >= MAX_PAGES) return { businesses: [], nextPageToken: null };
    const where = [q.city, q.region, q.country].filter(Boolean).join(", ");
    const count = Math.min(PER_PAGE, q.limit);

    const prompt = [
      `Find up to ${count} real, currently operating "${q.category}" businesses in ${where}.`,
      `Search broadly: Google Maps results, TripAdvisor, Yelp, Facebook/Instagram pages, local directories and articles.`,
      token.exclude.length ? `Do NOT include these (already found): ${token.exclude.slice(-150).join("; ")}.` : "",
      `Return them in the JSON schema.`,
    ].filter(Boolean).join("\n");

    let found: z.infer<typeof FoundSchema>;
    try {
      const res = await this.claude.generateJson(
        { system: SYSTEM, prompt, schema: FoundSchema, schemaName: "web_lead_search", tier: "large", maxTokens: 8000 },
        { tools: ["WebSearch", "WebFetch"], timeoutMs: 420_000 },
      );
      found = res.data;
    } catch (err) {
      throw new LeadProviderError(`Web search failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }

    const businesses: NormalizedBusiness[] = [];
    for (const f of found.businesses) {
      const sourceUrl = normalizeUrl(f.sourceUrl);
      if (!sourceUrl) continue;
      if (token.exclude.some((n) => normalizeBusinessName(n) === normalizeBusinessName(f.name))) continue;
      const verified = await this.verify(f.name, sourceUrl);
      if (verified === "reject") {
        logger.warn({ name: f.name, sourceUrl }, "web_search lead rejected: source page does not mention it");
        continue;
      }
      const social = normalizeUrl(f.socialProfile);
      businesses.push({
        source: this.name,
        sourceExternalId: `web:${normalizeBusinessName(f.name).replace(/\s+/g, "-")}:${normalizeBusinessName(q.city ?? q.country).replace(/\s+/g, "-")}`.slice(0, 180),
        businessName: f.name.trim(),
        category: q.category,
        address: f.address,
        city: q.city ?? null,
        region: q.region ?? null,
        country: q.country,
        phone: f.phone,
        email: f.email,
        websiteUrl: f.officialWebsite,
        rating: null,
        reviewCount: null,
        description: f.shortDescription,
        latitude: null,
        longitude: null,
        socialLinks: social ? { [new URL(social).hostname.replace(/^www\./, "").split(".")[0]]: social } : null,
        sourceUrl,
        sourceVerified: verified,
      });
    }

    const exclude = [...token.exclude, ...found.businesses.map((b) => b.name)];
    const more = found.businesses.length >= Math.min(count, 5) && token.page + 1 < MAX_PAGES;
    return { businesses, nextPageToken: more ? JSON.stringify({ page: token.page + 1, exclude }) : null };
  }

  async getBusiness(): Promise<NormalizedBusiness | null> {
    return null;
  }
}
