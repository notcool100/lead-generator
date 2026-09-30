import { ApifyError, TERMINAL_RUN_STATUSES, datasetItems, getRun, startRun } from "@/lib/apify";
import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import { LeadProviderError, type LeadProvider } from "./LeadProvider";

/**
 * Google Maps via Apify's "Google Maps Scraper" actor — https://apify.com/compass/crawler-google-places
 * One actor run per campaign crawls up to the campaign's lead cap; later discovery
 * batches page through that run's dataset, so places are only paid for once.
 * Like the Places API, Maps listings carry no email — see services/enrichment.
 */
export const GOOGLE_MAPS_ACTOR = "compass/crawler-google-places";
const MAX_PLACES_PER_RUN = 500;
/** How long one search call waits for the crawl to produce more places. */
const MAX_WAIT_ROUNDS = 4;

interface MapsPlace {
  placeId?: string;
  title?: string;
  categoryName?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  location?: { lat: number; lng: number };
  url?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
}

interface Cursor {
  run: string;
  ds: string;
  off: number;
}

export class ApifyGoogleMapsProvider implements LeadProvider {
  readonly name = "apify_google_maps";
  constructor(private readonly token: string) {
    if (!token) throw new LeadProviderError("APIFY_API_TOKEN is required for the Apify Google Maps source", false);
  }

  private normalize(p: MapsPlace, category: string, country: string): NormalizedBusiness {
    return {
      source: this.name,
      sourceExternalId: p.placeId!,
      businessName: p.title ?? "Unknown",
      category,
      address: p.address ?? null,
      city: p.city ?? null,
      region: p.state ?? null,
      country,
      phone: p.phone ?? p.phoneUnformatted ?? null,
      email: null,
      websiteUrl: p.website ?? null,
      rating: p.totalScore ?? null,
      reviewCount: p.reviewsCount ?? null,
      description: p.description ?? null,
      latitude: p.location?.lat ?? null,
      longitude: p.location?.lng ?? null,
      socialLinks: null,
      sourceUrl: p.url ?? null,
    };
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    try {
      const cur: Cursor = q.pageToken ? (JSON.parse(q.pageToken) as Cursor) : await this.start(q);
      for (let round = 0; ; round++) {
        const items = await datasetItems<MapsPlace>(this.token, cur.ds, cur.off, q.limit);
        if (items.length) {
          const next: Cursor = { ...cur, off: cur.off + items.length };
          return {
            businesses: items
              .filter((p) => p.placeId && !p.permanentlyClosed && !p.temporarilyClosed)
              .map((p) => this.normalize(p, q.category, q.country)),
            nextPageToken: JSON.stringify(next),
          };
        }
        // No new places yet: finished crawl = exhausted, otherwise wait for it.
        const run = await getRun(this.token, cur.run, 0);
        if (TERMINAL_RUN_STATUSES.includes(run.status)) {
          if (run.status !== "SUCCEEDED" && cur.off === 0) throw new LeadProviderError(`Apify Google Maps run ${run.status}`, false);
          return { businesses: [], nextPageToken: null };
        }
        if (round >= MAX_WAIT_ROUNDS) throw new LeadProviderError("Apify Google Maps crawl is still running; try again shortly", true);
        await getRun(this.token, cur.run, 60);
      }
    } catch (err) {
      if (err instanceof ApifyError) throw new LeadProviderError(err.message, err.transient);
      throw err;
    }
  }

  private async start(q: BusinessSearchQuery): Promise<Cursor> {
    const run = await startRun(this.token, GOOGLE_MAPS_ACTOR, {
      searchStringsArray: [q.category],
      locationQuery: [q.city, q.region, q.country].filter(Boolean).join(", "),
      maxCrawledPlacesPerSearch: Math.min(MAX_PLACES_PER_RUN, Math.max(q.limit, q.maxTotal ?? q.limit)),
      language: "en",
      skipClosedPlaces: true,
    });
    return { run: run.id, ds: run.defaultDatasetId, off: 0 };
  }

  async getBusiness(): Promise<NormalizedBusiness | null> {
    // Single-place lookups would need a paid actor run; callers fall back to stored data.
    return null;
  }
}
