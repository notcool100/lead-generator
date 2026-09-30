/** Provider-agnostic business record. Every LeadProvider normalises into this. */
export interface NormalizedBusiness {
  source: string;
  sourceExternalId: string;
  businessName: string;
  category: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  socialLinks: Record<string, string> | null;
  /** Public page where the business was found (map listing, directory, article). */
  sourceUrl?: string | null;
  /** true = page fetched and mentions the business; false = unverified; null/undefined = structured API data */
  sourceVerified?: boolean | null;
}

export interface BusinessSearchQuery {
  category: string;
  country: string;
  region?: string | null;
  city?: string | null;
  limit: number;
  /** Total leads the campaign may still take (providers that pay per crawl size use it). */
  maxTotal?: number;
  /** Opaque provider cursor for pagination. */
  pageToken?: string | null;
}

export interface BusinessSearchResult {
  businesses: NormalizedBusiness[];
  nextPageToken: string | null;
}
