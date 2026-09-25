import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import { LeadProviderError, type LeadProvider } from "./LeadProvider";

/**
 * Yelp Fusion API — https://docs.developer.yelp.com/reference/v3_business_search
 * Yelp does not expose a business's own website URL; website detection falls
 * back to domain discovery in WebsiteAnalyzer.
 */
interface YelpBusiness {
  id: string;
  name: string;
  url: string;
  phone?: string;
  rating?: number;
  review_count?: number;
  categories?: { title: string }[];
  coordinates?: { latitude: number; longitude: number };
  location?: { display_address?: string[]; city?: string; state?: string; country?: string };
}

export class YelpProvider implements LeadProvider {
  readonly name = "yelp";
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new LeadProviderError("LEAD_PROVIDER_API_KEY is required for Yelp", false);
  }

  private normalize(b: YelpBusiness, category: string, country: string): NormalizedBusiness {
    return {
      source: this.name,
      sourceExternalId: b.id,
      businessName: b.name,
      category,
      address: b.location?.display_address?.join(", ") ?? null,
      city: b.location?.city ?? null,
      region: b.location?.state ?? null,
      country: b.location?.country ?? country,
      phone: b.phone || null,
      email: null,
      websiteUrl: null,
      rating: b.rating ?? null,
      reviewCount: b.review_count ?? null,
      description: b.categories?.map((c) => c.title).join(", ") ?? null,
      latitude: b.coordinates?.latitude ?? null,
      longitude: b.coordinates?.longitude ?? null,
      socialLinks: { yelp: b.url.split("?")[0] },
      sourceUrl: b.url.split("?")[0],
    };
  }

  private async request(path: string) {
    const res = await fetch(`https://api.yelp.com/v3${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new LeadProviderError(`Yelp ${res.status}`, res.status >= 500 || res.status === 429);
    return res.json();
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    const offset = Number(q.pageToken ?? 0);
    const params = new URLSearchParams({
      term: q.category,
      location: [q.city, q.region, q.country].filter(Boolean).join(", "),
      limit: String(Math.min(50, q.limit)),
      offset: String(offset),
    });
    const data = (await this.request(`/businesses/search?${params}`)) as { businesses: YelpBusiness[]; total: number };
    const next = offset + data.businesses.length;
    return {
      businesses: data.businesses.map((b) => this.normalize(b, q.category, q.country)),
      nextPageToken: next < Math.min(data.total, 240) && data.businesses.length > 0 ? String(next) : null,
    };
  }

  async getBusiness(externalId: string) {
    const b = (await this.request(`/businesses/${encodeURIComponent(externalId)}`)) as YelpBusiness | null;
    return b ? this.normalize(b, b.categories?.[0]?.title ?? "business", "") : null;
  }
}
