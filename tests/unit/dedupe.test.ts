import { describe, expect, it } from "vitest";
import { dedupeBusinesses, dedupeKeys } from "@/services/lead-discovery/dedupe";
import { normalizeAddress, normalizeBusinessName, normalizeUrl } from "@/lib/normalize";

const base = { source: "google_places", sourceExternalId: "a1", businessName: "Mario's Pizza", address: "12 Main Street", websiteUrl: null as string | null, email: null as string | null };

describe("normalisation", () => {
  it("normalises business names", () => {
    expect(normalizeBusinessName("The Café Olé & Co.")).toBe("ole");
    expect(normalizeBusinessName("Mario's Pizza Restaurant")).toBe("marios pizza");
  });
  it("normalises addresses", () => {
    expect(normalizeAddress("12 Main Street")).toBe(normalizeAddress("12, main st."));
  });
  it("normalises URLs (scheme, tracking params, localhost)", () => {
    expect(normalizeUrl("example.com/?utm_source=x")).toBe("https://example.com/");
    expect(normalizeUrl("http://localhost:3000/a")).toBe("http://localhost:3000/a");
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("dedupe", () => {
  it("dedupes by provider external id", () => {
    const { unique, duplicates } = dedupeBusinesses([base, { ...base, businessName: "Different" }]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
  it("dedupes by normalised name + address across providers", () => {
    const r = dedupeBusinesses([base, { ...base, source: "yelp", sourceExternalId: "y9", businessName: "Marios Pizza", address: "12 Main St" }]);
    expect(r.unique).toHaveLength(1);
  });
  it("dedupes by domain and email", () => {
    const a = { ...base, websiteUrl: "https://www.marios.com" };
    const b = { ...base, sourceExternalId: "a2", address: "elsewhere", websiteUrl: "marios.com/menu" };
    expect(dedupeBusinesses([a, b]).unique).toHaveLength(1);
    const c = { ...base, email: "Hi@Marios.com" };
    const d = { ...base, sourceExternalId: "a3", address: "x", email: "hi@marios.com" };
    expect(dedupeBusinesses([c, d]).unique).toHaveLength(1);
  });
  it("does not use social hosts as a dedupe domain", () => {
    expect(dedupeKeys({ ...base, websiteUrl: "https://facebook.com/marios" }).domain).toBeNull();
  });
  it("keeps genuinely different businesses", () => {
    const r = dedupeBusinesses([base, { ...base, sourceExternalId: "b", businessName: "Luigi's", address: "99 High St" }]);
    expect(r.unique).toHaveLength(2);
  });
});

describe("dedupe hosts", () => {
  it("ignores IP and localhost hosts as identity", () => {
    const b = { source: "x", sourceExternalId: "1", businessName: "A", address: null, email: null };
    expect(dedupeKeys({ ...b, websiteUrl: "http://127.0.0.1:3000/a" }).domain).toBeNull();
    expect(dedupeKeys({ ...b, websiteUrl: "http://localhost:3000/a" }).domain).toBeNull();
  });
});
