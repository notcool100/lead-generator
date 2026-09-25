import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiLeadProvider } from "@/providers/leads/MultiLeadProvider";
import { OpenStreetMapProvider } from "@/providers/leads/OpenStreetMapProvider";
import type { LeadProvider } from "@/providers/leads/LeadProvider";
import type { NormalizedBusiness } from "@/types/lead";

const biz = (name: string, source: string): NormalizedBusiness => ({
  source, sourceExternalId: name, businessName: name, category: "cafe", address: null, city: "X", region: null, country: "Y",
  phone: null, email: null, websiteUrl: null, rating: null, reviewCount: null, description: null, latitude: null, longitude: null, socialLinks: null,
});

function fake(name: string, pages: string[][], fail = false): LeadProvider {
  return {
    name,
    async searchBusinesses(q) {
      if (fail) throw new Error("boom");
      const i = Number(q.pageToken ?? 0);
      return { businesses: (pages[i] ?? []).map((n) => biz(n, name)), nextPageToken: i + 1 < pages.length ? String(i + 1) : null };
    },
    async getBusiness() {
      return null;
    },
  };
}

describe("MultiLeadProvider", () => {
  it("exhausts each source in order and skips failing sources", async () => {
    const p = new MultiLeadProvider([fake("a", [["a1"], ["a2"]]), fake("broken", [], true), fake("c", [["c1"]])]);
    const names: string[] = [];
    let token: string | null = null;
    let failed: string[] = [];
    do {
      const r = await p.searchBusinesses({ category: "cafe", country: "Y", limit: 10, pageToken: token });
      names.push(...r.businesses.map((b) => b.businessName));
      failed = r.failed ?? failed;
      token = r.nextPageToken;
    } while (token);
    expect(names).toEqual(["a1", "a2", "c1"]);
    expect(failed[0]).toMatch(/broken: boom/);
  });
});

describe("OpenStreetMapProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("geocodes, falls back across Overpass mirrors and normalises OSM tags", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("nominatim")) return new Response(JSON.stringify([{ boundingbox: ["1", "2", "3", "4"] }]));
      if (String(url).includes("mirror-a")) return new Response("<html>busy</html>", { status: 504 });
      return new Response(
        JSON.stringify({
          elements: [
            { type: "node", id: 1, lat: 1.5, lon: 3.5, tags: { name: "Bean There", amenity: "cafe", "addr:street": "Lake Rd", "addr:housenumber": "6", "contact:phone": "+977 1", website: "beanthere.com", "contact:instagram": "beanthere" } },
            { type: "way", id: 2, center: { lat: 1, lon: 3 }, tags: { amenity: "cafe" } },
            { type: "node", id: 3, tags: { name: "Quiet Cup", amenity: "cafe" } },
          ],
        }),
      );
    });
    const p = new OpenStreetMapProvider(["https://mirror-a/api", "https://mirror-b/api"]);
    const r = await p.searchBusinesses({ category: "cafe", city: "Pokhara", country: "Nepal", limit: 10 });
    expect(calls.some((c) => c.includes("mirror-b"))).toBe(true);
    expect(r.businesses.map((b) => b.businessName)).toEqual(["Bean There", "Quiet Cup"]); // unnamed dropped, contactable first
    const b = r.businesses[0];
    expect(b).toMatchObject({ address: "6 Lake Rd", phone: "+977 1", websiteUrl: "beanthere.com", sourceExternalId: "node/1", sourceUrl: "https://www.openstreetmap.org/node/1" });
    expect(b.socialLinks?.instagram).toBe("https://instagram.com/beanthere");
  });
});
