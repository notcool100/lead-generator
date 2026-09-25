import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";
import { LeadProviderError, type LeadProvider } from "./LeadProvider";

/**
 * OpenStreetMap: Nominatim (geocoding the city/region) + Overpass API (POIs).
 * Free, no API key, live map data (ODbL — attribution "© OpenStreetMap contributors").
 * Usage policies: identify with a User-Agent, keep request volume low
 * (https://operations.osmfoundation.org/policies/nominatim/).
 */
type Tag = [key: string, value: string];

/** Category → OSM tag filters. Unknown categories fall back to a name search. */
const CATEGORY_TAGS: { match: RegExp; tags: Tag[] }[] = [
  { match: /restaurant|bistro|trattoria|pizz|grill|diner|eatery|steak|sushi|food/, tags: [["amenity", "restaurant"], ["amenity", "fast_food"]] },
  { match: /caf[eé]|coffee|bakery|tea|patisserie|brunch/, tags: [["amenity", "cafe"], ["shop", "bakery"], ["shop", "pastry"]] },
  { match: /\bbar\b|pub|brewery|cocktail/, tags: [["amenity", "bar"], ["amenity", "pub"], ["amenity", "biergarten"]] },
  { match: /hotel|inn|guest|hostel|b&b|bed and breakfast|motel|resort|lodge/, tags: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"], ["tourism", "motel"]] },
  { match: /gym|fitness|crossfit|yoga|pilates|boxing|martial/, tags: [["leisure", "fitness_centre"], ["leisure", "sports_centre"], ["sport", "yoga"]] },
  { match: /salon|hair|barber|beauty|nail|spa|lash|brow|massage/, tags: [["shop", "hairdresser"], ["shop", "beauty"], ["shop", "massage"], ["leisure", "spa"]] },
  { match: /dent|orthodont/, tags: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  { match: /clinic|doctor|physio|medical/, tags: [["amenity", "clinic"], ["amenity", "doctors"], ["healthcare", "physiotherapist"]] },
  { match: /wedding|venue|event|banquet|conference/, tags: [["amenity", "events_venue"], ["amenity", "conference_centre"], ["amenity", "community_centre"]] },
  { match: /real estate|estate agent|realtor|property|letting/, tags: [["office", "estate_agent"], ["shop", "estate_agent"]] },
  { match: /lawyer|law|solicitor|accountant|consult|architect|insurance|professional/, tags: [["office", "lawyer"], ["office", "accountant"], ["office", "consulting"], ["office", "architect"], ["office", "insurance"]] },
];

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Search area: city centre + radius (big city boundaries make Overpass time out). */
interface Area {
  lat: number;
  lon: number;
  radius: number;
}
const MAX_RADIUS_M = 7000;
const geocodeCache = new Map<string, Area>();

export class OpenStreetMapProvider implements LeadProvider {
  readonly name = "openstreetmap";
  private readonly userAgent: string;

  constructor(private readonly overpassUrls: string[], contact?: string) {
    this.userAgent = `LeadGenerator/1.0 (${contact || "website-preview-tool"})`;
  }

  private async geocode(q: BusinessSearchQuery): Promise<Area> {
    const place = [q.city, q.region, q.country].filter(Boolean).join(", ");
    const cached = geocodeCache.get(place);
    if (cached) return cached;
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: place, format: "json", limit: "1" })}`;
    const res = await fetch(url, { headers: { "User-Agent": this.userAgent, "Accept-Language": "en" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new LeadProviderError(`Nominatim ${res.status}`, res.status >= 500 || res.status === 429);
    const data = (await res.json()) as { lat: string; lon: string; boundingbox: [string, string, string, string] }[];
    if (!data[0]) throw new LeadProviderError(`Location not found on OpenStreetMap: ${place}`, false);
    const [s, n, w, e] = data[0].boundingbox.map(Number);
    const lat = Number(data[0].lat);
    const lon = Number(data[0].lon);
    // Half the diagonal of the place's bounding box, capped so large cities stay fast.
    const dLat = (n - s) * 111_000;
    const dLon = (e - w) * 111_000 * Math.cos((lat * Math.PI) / 180);
    const area: Area = { lat, lon, radius: Math.round(Math.min(MAX_RADIUS_M, Math.max(1500, Math.hypot(dLat, dLon) / 2))) };
    geocodeCache.set(place, area);
    return area;
  }

  private buildQuery(category: string, area: Area, limit: number) {
    const c = category.toLowerCase();
    const tags = CATEGORY_TAGS.find((t) => t.match.test(c))?.tags;
    const box = `around:${area.radius},${area.lat.toFixed(5)},${area.lon.toFixed(5)}`;
    const filters = tags
      ? tags.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${box});`).join("\n")
      : `nwr["name"~"${c.replace(/[^a-z0-9 ]/g, "")}",i]["shop"](${box});\nnwr["name"~"${c.replace(/[^a-z0-9 ]/g, "")}",i]["amenity"](${box});`;
    return `[out:json][timeout:40];(\n${filters}\n);out center tags ${Math.min(limit, 400)};`;
  }

  private async overpass(query: string): Promise<OsmElement[]> {
    let lastErr: unknown;
    for (const url of this.overpassUrls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": this.userAgent, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(50_000),
        });
        const text = await res.text();
        if (!res.ok || !text.trim().startsWith("{")) throw new Error(`Overpass ${res.status} at ${new URL(url).host}`);
        return (JSON.parse(text) as { elements: OsmElement[] }).elements;
      } catch (err) {
        lastErr = err;
      }
    }
    throw new LeadProviderError(`All Overpass servers failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`, true);
  }

  private normalize(el: OsmElement, category: string, q: BusinessSearchQuery): NormalizedBusiness | null {
    const t = el.tags ?? {};
    if (!t.name) return null;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const address = [street, t["addr:postcode"], t["addr:city"]].filter(Boolean).join(", ") || t["addr:full"] || null;
    const website = t.website ?? t["contact:website"] ?? t.url ?? null;
    const social: Record<string, string> = {};
    for (const k of ["facebook", "instagram", "tiktok", "twitter"]) {
      const v = t[`contact:${k}`] ?? t[k];
      if (v) social[k] = v.startsWith("http") ? v : `https://${k}.com/${v.replace(/^@/, "")}`;
    }
    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;
    return {
      source: this.name,
      sourceExternalId: `${el.type}/${el.id}`,
      businessName: t.name,
      category,
      address,
      city: t["addr:city"] ?? q.city ?? null,
      region: q.region ?? null,
      country: q.country,
      phone: t.phone ?? t["contact:phone"] ?? t["contact:mobile"] ?? null,
      email: t.email ?? t["contact:email"] ?? null,
      websiteUrl: website,
      rating: null,
      reviewCount: null,
      description: t.description ?? (t.cuisine ? `Cuisine: ${t.cuisine.replace(/;/g, ", ")}` : null),
      latitude: lat,
      longitude: lon,
      socialLinks: Object.keys(social).length ? social : null,
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      sourceVerified: null,
    };
  }

  /** One Overpass query per campaign; pageToken is the offset into the cached result. */
  private readonly resultCache = new Map<string, NormalizedBusiness[]>();

  async searchBusinesses(q: BusinessSearchQuery): Promise<BusinessSearchResult> {
    const key = JSON.stringify([q.category, q.city, q.region, q.country]);
    let all = this.resultCache.get(key);
    if (!all) {
      const area = await this.geocode(q);
      const elements = await this.overpass(this.buildQuery(q.category, area, 400));
      // Businesses with contact details first — they are actionable.
      all = elements
        .map((el) => this.normalize(el, q.category, q))
        .filter((b): b is NormalizedBusiness => Boolean(b))
        .sort((a, b) => Number(Boolean(b.email || b.phone)) - Number(Boolean(a.email || a.phone)));
      this.resultCache.set(key, all);
    }
    const offset = Number(q.pageToken ?? 0);
    const page = all.slice(offset, offset + q.limit);
    const next = offset + page.length;
    return { businesses: page, nextPageToken: next < all.length ? String(next) : null };
  }

  async getBusiness(externalId: string): Promise<NormalizedBusiness | null> {
    const [type, id] = externalId.split("/");
    if (!type || !/^\d+$/.test(id ?? "")) return null;
    const els = await this.overpass(`[out:json][timeout:25];${type}(${id});out center tags;`);
    return els[0] ? this.normalize(els[0], "business", { category: "business", country: "", limit: 1 }) : null;
  }
}
