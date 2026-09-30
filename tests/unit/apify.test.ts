import { afterEach, describe, expect, it, vi } from "vitest";
import { ApifyGoogleMapsProvider } from "@/providers/leads/ApifyGoogleMapsProvider";
import { facebookPageUrl, findFacebookEmail, mentionsBusiness } from "@/services/enrichment/facebookEmail";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("ApifyGoogleMapsProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts one crawl, pages through its dataset and normalises places", async () => {
    const places = [
      { placeId: "p1", title: "Bean There", address: "Lake Rd 6", city: "Pokhara", phone: "+977 61-000000", totalScore: 4.6, reviewsCount: 88, location: { lat: 1, lng: 2 }, url: "https://maps.google.com/?cid=1" },
      { placeId: "p2", title: "Shut Cafe", permanentlyClosed: true },
      { placeId: "p3", title: "Quiet Cup", website: "https://quietcup.com" },
    ];
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/acts/compass~crawler-google-places/runs")) return json({ data: { id: "run1", status: "RUNNING", defaultDatasetId: "ds1" } });
      if (url.includes("/datasets/ds1/items")) {
        const u = new URL(url);
        const off = Number(u.searchParams.get("offset"));
        return json(places.slice(off, off + Number(u.searchParams.get("limit"))));
      }
      if (url.includes("/actor-runs/run1")) return json({ data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1" } });
      throw new Error(`unexpected ${url}`);
    });

    const p = new ApifyGoogleMapsProvider("tok");
    const first = await p.searchBusinesses({ category: "cafe", country: "Nepal", city: "Pokhara", limit: 2, maxTotal: 50 });
    expect(first.businesses.map((b) => b.businessName)).toEqual(["Bean There"]);
    expect(first.businesses[0]).toMatchObject({ source: "apify_google_maps", sourceExternalId: "p1", country: "Nepal", rating: 4.6, email: null });
    const started = JSON.parse(String(calls[0].init?.body));
    expect(started).toMatchObject({ searchStringsArray: ["cafe"], locationQuery: "Pokhara, Nepal", maxCrawledPlacesPerSearch: 50 });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(calls[0].url).not.toContain("tok");

    const second = await p.searchBusinesses({ category: "cafe", country: "Nepal", limit: 2, pageToken: first.nextPageToken });
    expect(second.businesses.map((b) => b.websiteUrl)).toEqual(["https://quietcup.com"]);
    const third = await p.searchBusinesses({ category: "cafe", country: "Nepal", limit: 2, pageToken: second.nextPageToken });
    expect(third).toEqual({ businesses: [], nextPageToken: null });
    // Only one paid crawl for the whole campaign.
    expect(calls.filter((c) => c.url.includes("/runs?")).length).toBe(1);
  });
});

describe("Facebook email enrichment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only real page URLs", () => {
    expect(facebookPageUrl("https://m.facebook.com/beanthere/about?ref=x")).toBe("https://www.facebook.com/beanthere");
    expect(facebookPageUrl("https://www.facebook.com/profile.php?id=123&sk=about")).toBe("https://www.facebook.com/profile.php?id=123");
    expect(facebookPageUrl("https://www.facebook.com/groups/pokhara")).toBeNull();
    expect(facebookPageUrl("https://facebook.com.evil.io/beanthere")).toBeNull();
  });

  it("matches business names against result titles and squashed page slugs", () => {
    expect(mentionsBusiness("Bean There Cafe", "https://www.facebook.com/beanthere")).toBe(true);
    expect(mentionsBusiness("Bean There Cafe", "Himalayan Java | Pokhara")).toBe(false);
  });

  it("finds the page via search, then reads its email", async () => {
    const actors: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      actors.push(url);
      if (url.includes("google-search-scraper")) {
        return json([{ organicResults: [
          { url: "https://www.facebook.com/groups/pokharafood", title: "Pokhara food group" },
          { url: "https://www.facebook.com/beanthere.pokhara/", title: "Bean There - Pokhara | Facebook" },
        ] }]);
      }
      if (url.includes("facebook-pages-scraper")) return json([{ email: "Hello@BeanThere.com.np" }]);
      throw new Error(`unexpected ${url}`);
    });
    const r = await findFacebookEmail("tok", { businessName: "Bean There", city: "Pokhara", country: "Nepal" });
    expect(r).toEqual({ email: "hello@beanthere.com.np", facebookUrl: "https://www.facebook.com/beanthere.pokhara" });
    expect(actors[0]).toContain("apify~google-search-scraper");
  });

  it("skips the search when the Facebook link is already known and falls back to the intro text", async () => {
    const actors: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      actors.push(url);
      return json([{ email: null, intro: "Fresh coffee daily. Orders: orders@quietcup.np" }]);
    });
    const r = await findFacebookEmail("tok", { businessName: "Quiet Cup", city: null, country: "Nepal", facebookUrl: "https://facebook.com/quietcup" });
    expect(r.email).toBe("orders@quietcup.np");
    expect(actors).toHaveLength(1);
  });
});
