import { createHash } from "node:crypto";
import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import type { LeadProvider } from "./LeadProvider";

/**
 * Development provider. Produces deterministic, clearly-synthetic businesses so
 * the full pipeline can run without paid API keys. All records use the
 * `.example` / `example.com` reserved namespaces and `mock` source so they can
 * never be confused with real businesses — and the email provider refuses to
 * send to reserved domains.
 */
const PREFIXES = ["Golden", "Blue", "Old Town", "Riverside", "Corner", "Little", "Harbor", "Olive", "Maple", "Sunset", "North", "Urban"];
const SUFFIXES: Record<string, string[]> = {
  restaurant: ["Kitchen", "Trattoria", "Grill", "Bistro", "Table"],
  cafe: ["Coffee House", "Roasters", "Espresso Bar", "Café"],
  hotel: ["Inn", "Guesthouse", "Boutique Hotel", "Suites"],
  salon: ["Hair Studio", "Beauty Lounge", "Salon"],
  gym: ["Fitness", "Strength Club", "Training Studio"],
  dentist: ["Dental Care", "Smile Clinic", "Dental Studio"],
  bar: ["Tap Room", "Cocktail Bar", "Pub"],
  event_venue: ["Event Hall", "Gardens", "Loft"],
  default: ["Studio", "Company", "House"],
};

function hash(s: string) {
  return createHash("sha1").update(s).digest();
}

export class MockLeadProvider implements LeadProvider {
  readonly name = "mock";
  /** base URL where mock "existing websites" are served (see app/mock-sites). */
  constructor(private readonly mockSiteBase = `${process.env.APP_URL ?? "http://localhost:3000"}/mock-sites`) {}

  private make(q: BusinessSearchQuery, i: number): NormalizedBusiness {
    const key = `${q.category}|${q.city}|${q.country}|${i}`;
    const h = hash(key);
    const cat = q.category.toLowerCase().replace(/\s+/g, "_");
    const suffixes = SUFFIXES[cat] ?? SUFFIXES.default;
    const name = `${PREFIXES[h[0] % PREFIXES.length]} ${suffixes[h[1] % suffixes.length]}${i >= PREFIXES.length ? ` ${i}` : ""}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const variant = h[2] % 4; // 0 none, 1 poor, 2 outdated, 3 good
    const website = variant === 0 ? null : `${this.mockSiteBase}/${["", "poor", "outdated", "good"][variant]}?name=${encodeURIComponent(name)}`;
    return {
      source: this.name,
      sourceExternalId: `mock_${h.toString("hex").slice(0, 16)}`,
      businessName: name,
      category: q.category,
      address: `${(h[3] % 200) + 1} Example Street`,
      city: q.city ?? null,
      region: q.region ?? null,
      country: q.country,
      phone: `+00 555 ${String(1000 + (h[4] << 4)).slice(0, 4)}`,
      email: h[5] % 5 === 0 ? null : `hello@${slug}.example`,
      websiteUrl: website,
      rating: Math.round((3.4 + (h[6] % 16) / 10) * 10) / 10,
      reviewCount: 5 + (h[7] % 400),
      description: null,
      latitude: null,
      longitude: null,
      socialLinks: h[8] % 2 ? { instagram: `https://instagram.com/${slug.replace(/-/g, "")}` } : null,
    };
  }

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    const start = Number(q.pageToken ?? 0);
    const pageSize = Math.min(20, q.limit);
    const total = 60;
    const businesses = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, k) => this.make(q, start + k));
    const next = start + businesses.length;
    return { businesses, nextPageToken: next < total ? String(next) : null };
  }

  async getBusiness(): Promise<NormalizedBusiness | null> {
    return null;
  }
}
