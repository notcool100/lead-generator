import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import { LeadProviderError, type LeadProvider } from "./LeadProvider";

/**
 * Google Places API (New) — https://developers.google.com/maps/documentation/places/web-service/text-search
 * Uses Text Search + field masks so we only pay for fields we store.
 * Note: Places does not return email addresses; emails must come from the
 * business's own website (see WebsiteAnalyzer contact extraction).
 */
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
  "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.websiteUri",
  "places.rating", "places.userRatingCount", "places.editorialSummary", "places.location",
  "places.primaryTypeDisplayName", "places.googleMapsUri", "places.businessStatus", "nextPageToken",
].join(",");

interface PlacesPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; types: string[] }[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  editorialSummary?: { text: string };
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  businessStatus?: string;
}

export class GooglePlacesProvider implements LeadProvider {
  readonly name = "google_places";
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new LeadProviderError("LEAD_PROVIDER_API_KEY is required for Google Places", false);
  }

  private normalize(p: PlacesPlace, category: string, fallbackCountry: string): NormalizedBusiness {
    const comp = (type: string) => p.addressComponents?.find((c) => c.types.includes(type))?.longText ?? null;
    return {
      source: this.name,
      sourceExternalId: p.id,
      businessName: p.displayName?.text ?? "Unknown",
      category,
      address: p.formattedAddress ?? null,
      city: comp("locality") ?? comp("postal_town"),
      region: comp("administrative_area_level_1"),
      country: comp("country") ?? fallbackCountry,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      email: null,
      websiteUrl: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      description: p.editorialSummary?.text ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      socialLinks: null,
      sourceUrl: p.googleMapsUri ?? null,
    };
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    const where = [q.city, q.region, q.country].filter(Boolean).join(", ");
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${q.category} in ${where}`,
        pageSize: Math.min(20, q.limit),
        pageToken: q.pageToken ?? undefined,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new LeadProviderError(`Google Places ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 || res.status === 429);
    }
    const data = (await res.json()) as { places?: PlacesPlace[]; nextPageToken?: string };
    return {
      // Skip permanently/temporarily closed businesses.
      businesses: (data.places ?? []).filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL").map((p) => this.normalize(p, q.category, q.country)),
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  async getBusiness(externalId: string): Promise<NormalizedBusiness | null> {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(externalId)}`, {
      headers: { "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": FIELD_MASK.replace(/places\./g, "").replace(",nextPageToken", "") },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new LeadProviderError(`Google Places ${res.status}`, res.status >= 500);
    const p = (await res.json()) as PlacesPlace;
    return this.normalize(p, p.primaryTypeDisplayName?.text ?? "business", "");
  }
}
