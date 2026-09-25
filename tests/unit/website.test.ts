import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractSignals } from "@/services/website-analysis/htmlSignals";
import { scoreWebsite } from "@/services/website-analysis/scoring";
import { candidateDomains, WebsiteAnalyzer } from "@/services/website-analysis/WebsiteAnalyzer";

const GOOD = `<!doctype html><html><head><title>Luna</title><meta name="viewport" content="width=device-width"><meta name="description" content="x"><meta property="og:title" content="Luna"><link rel="icon" href="/f.ico"><script type="application/ld+json">{}</script></head><body><h1>Luna</h1><h2>Menu</h2><h3>Visit</h3><p>${"Fresh food every day. ".repeat(80)}</p><img src="a.jpg" alt="a"><a href="#book">Book a table</a><a href="mailto:hi@luna.com">hi@luna.com</a><a href="https://instagram.com/luna">ig</a><footer>© ${new Date().getFullYear()}</footer></body></html>`;
const POOR = `<html><head><title>Old</title></head><body><table width="700"><tr><td width="700"><table><tr><td width="1">Welcome</td></tr></table></td></tr></table><p>© 2012 Old Place</p><script src="jquery-1.4.js"></script></body></html>`;

describe("html signals", () => {
  it("extracts contact, social, cta and viewport", () => {
    const s = extractSignals(GOOD, "https://luna.com");
    expect(s.hasViewport).toBe(true);
    expect(s.emails).toContain("hi@luna.com");
    expect(s.socialLinks.instagram).toBeDefined();
    expect(s.hasClearCta).toBe(true);
    expect(s.hasBooking).toBe(true);
  });
  it("detects outdated signals", () => {
    const s = extractSignals(POOR, "http://old.com");
    expect(s.hasViewport).toBe(false);
    expect(s.copyrightYear).toBe(2012);
    expect(s.usesTableLayout).toBe(true);
    expect(s.usesLegacyJquery).toBe(true);
  });
});

describe("website scoring", () => {
  const tech = { https: true, sslValid: true, statusCode: 200, responseTimeMs: 300, redirectCount: 0 };
  it("scores a modern site as good/excellent", () => {
    const r = scoreWebsite(extractSignals(GOOD, "https://luna.com"), tech);
    expect(r.overallScore).toBeGreaterThanOrEqual(75);
    expect(["good_website", "excellent_website"]).toContain(r.status);
  });
  it("scores an old table site as poor with reasons", () => {
    const r = scoreWebsite(extractSignals(POOR, "http://old.com"), { ...tech, https: false, sslValid: null });
    expect(r.overallScore).toBeLessThan(50);
    expect(r.status).toBe("poor_website");
    expect(r.reasons.join(" ")).toMatch(/HTTPS/);
    expect(r.reasons.join(" ")).toMatch(/2012/);
  });
  it("caps parked domains and error pages", () => {
    const parked = extractSignals("<html><body>This domain is for sale</body></html>", "https://x.com");
    expect(scoreWebsite(parked, tech).overallScore).toBeLessThanOrEqual(15);
    expect(scoreWebsite(extractSignals(GOOD, "https://luna.com"), { ...tech, statusCode: 404 }).overallScore).toBeLessThanOrEqual(10);
  });
  it("always returns 0-100", () => {
    const r = scoreWebsite(extractSignals("", "http://x.com"), { https: false, sslValid: false, statusCode: 200, responseTimeMs: 9000, redirectCount: 9 });
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("website detection", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") return res.writeHead(301, { Location: "/good" }).end();
      if (req.url === "/down") return res.writeHead(503).end();
      res.writeHead(200, { "Content-Type": "text/html" }).end(req.url === "/good" ? GOOD : POOR);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const analyzer = new WebsiteAnalyzer({ domainDiscovery: false });

  it("does not claim no_website when a URL is listed", async () => {
    const r = await analyzer.analyze({ businessName: "Luna", websiteUrl: `${base}/redirect` });
    expect(r.status).not.toBe("no_website");
    expect(r.reachable).toBe(true);
    expect(r.finalUrl).toContain("/good");
  });
  it("reports unreachable for server errors and dead hosts", async () => {
    expect((await analyzer.analyze({ businessName: "X", websiteUrl: `${base}/down` })).status).toBe("unreachable");
    expect((await analyzer.analyze({ businessName: "X", websiteUrl: "http://127.0.0.1:1" })).status).toBe("unreachable");
  });
  it("marks invalid listed URLs as unknown, not no_website", async () => {
    expect((await analyzer.analyze({ businessName: "X", websiteUrl: "not a url" })).status).toBe("unknown");
  });
  it("treats social-only presence as no official website", async () => {
    const r = await analyzer.analyze({ businessName: "X", websiteUrl: "https://facebook.com/x" });
    expect(r.status).toBe("no_website");
    expect(r.reasons[0]).toMatch(/third-party/);
  });
  it("reports no_website with the reason when nothing is listed", async () => {
    const r = await analyzer.analyze({ businessName: "Nothing Here", websiteUrl: null });
    expect(r.status).toBe("no_website");
    expect(r.reasons[0]).toMatch(/No website listed/);
  });
  it("builds bounded candidate domains", () => {
    expect(candidateDomains("Mario's Pizza", "Italy")).toEqual(["mariospizza.com", "mariospizza.it"]);
    expect(candidateDomains("Bar", null)).toEqual([]);
  });
});
