import { describe, expect, it } from "vitest";
import { BusinessAnalysisSchema } from "@/prompts/business-analysis";
import { WebsiteCopySchema } from "@/prompts/website-content";
import { MockAIProvider } from "@/providers/ai/MockAIProvider";
import { PreviewConfigSchema } from "@/types/preview";
import { createHash } from "node:crypto";
import { previewCsp, renderPreviewHtml } from "@/templates/render";
import { matchTemplateByKeyword } from "@/templates/registry";
import "@/prompts/outreach";

describe("AI JSON validation", () => {
  it("rejects out-of-range and missing fields", () => {
    expect(BusinessAnalysisSchema.safeParse({ summary: "x" }).success).toBe(false);
    const ok = {
      summary: "s", websiteOpportunity: "o", strengths: [], weaknesses: [], recommendedFeatures: [], recommendedSections: [],
      tone: "warm", primaryCTA: "Book", secondaryCTA: null, targetAudience: null, confidence: 0.5,
    };
    expect(BusinessAnalysisSchema.safeParse(ok).success).toBe(true);
    expect(BusinessAnalysisSchema.safeParse({ ...ok, confidence: 3 }).success).toBe(false);
  });
  it("restricts font pairs to the allow-list", () => {
    const copy = { headline: "h", subheadline: "s", about: null, primaryCTALabel: "Go", secondaryCTALabel: null, highlights: [], sections: [], paletteIndex: 0, fontPair: "comic-sans", seoTitle: "t", seoDescription: "d" };
    expect(WebsiteCopySchema.safeParse(copy).success).toBe(false);
  });
  it("preview config rejects non-hex colours (no CSS injection)", () => {
    const cfg = sampleConfig();
    expect(PreviewConfigSchema.safeParse(cfg).success).toBe(true);
    expect(PreviewConfigSchema.safeParse({ ...cfg, colors: { ...cfg.colors, primary: "red;}</style><script>" } }).success).toBe(false);
  });
  it("mock provider validates its output against the schema", async () => {
    const p = new MockAIProvider();
    await expect(p.generateJson({ system: "", prompt: "no facts", schema: BusinessAnalysisSchema, schemaName: "business_analysis", tier: "large" })).rejects.toThrow();
  });
});

describe("template rendering", () => {
  it("escapes every dynamic value", () => {
    const cfg = sampleConfig();
    cfg.businessName = `<script>alert(1)</script>`;
    cfg.headline = `"><img src=x onerror=alert(1)>`;
    cfg.primaryCTA.href = "javascript:alert(1)";
    const html = renderPreviewHtml(cfg);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
  });
  it("marks placeholder content clearly instead of inventing offerings", () => {
    const html = renderPreviewHtml(sampleConfig());
    expect(html).toContain("Sample section");
    expect(html).toContain("Not an official website");
    // no invented testimonials: review cards are explicit placeholders
    expect(html).not.toContain("<blockquote>Your favourite");
  });
  it("shows reviews only from real rating data, supports dark mode and reduced motion, uses no em-dashes", () => {
    const cfg = sampleConfig();
    expect(renderPreviewHtml(cfg)).not.toContain('id="reviews"');
    cfg.content.rating = { value: 4.6, count: 412, source: "google" };
    const html = renderPreviewHtml(cfg);
    expect(html).toContain('id="reviews"');
    expect(html).toContain("Average from 412 reviews");
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain("prefers-reduced-motion:no-preference");
    expect(html).not.toMatch(/[\u2014\u2013]/);
    expect(html).not.toMatch(/<script/i);
  });
  it("uses licensed photos with srcset and credits photographers", () => {
    const cfg = sampleConfig();
    const img = { url: "https://images.unsplash.com/photo-1?w=1600", alt: "Dining room", source: "unsplash", license: "Unsplash License", attribution: "Ana Silva on Unsplash", attributionUrl: "https://unsplash.com/@ana" };
    cfg.images = { hero: img, gallery: [img] };
    const html = renderPreviewHtml(cfg);
    expect(html).toContain("srcset=");
    expect(html).toContain("Ana Silva on Unsplash");
  });
  it("maps categories to templates deterministically", () => {
    expect(matchTemplateByKeyword("Italian restaurant")).toBe("restaurant");
    expect(matchTemplateByKeyword("Hair salon")).toBe("salon");
    expect(matchTemplateByKeyword("Wedding venue")).toBe("event_venue");
    expect(matchTemplateByKeyword("florist")).toBeNull();
    expect(matchTemplateByKeyword("Construction company")).toBe("construction");
    expect(matchTemplateByKeyword("Roofing contractor")).toBe("construction");
    expect(matchTemplateByKeyword("General construction services")).toBe("construction");
  });
});

describe("construction (industrial) template", () => {
  function constructionConfig() {
    const cfg = sampleConfig();
    cfg.templateKey = "construction";
    cfg.category = "roofing contractor";
    cfg.content.offeringsTitle = "Services";
    cfg.content.offeringsPlaceholder = ["New builds", "Renovations"];
    return cfg;
  }
  it("renders the Summit layout from lead data without em-dashes", () => {
    const cfg = constructionConfig();
    cfg.content.rating = { value: 4.8, count: 126, source: "google" };
    const html = renderPreviewHtml(cfg);
    expect(html).toContain("family=Anton");
    expect(html).toContain('id="projects"');
    expect(html).toContain("Roofing contractor, Lisbon, Portugal");
    expect(html).toContain("4.8★");
    expect(html).toContain("Average from 126 reviews");
    expect(html).toContain("Not an official website");
    expect(html).toContain("prefers-reduced-motion:no-preference");
    expect(html).toContain('data-count="4.8"');
    expect(html).toContain("videos.pexels.com");
    expect(html).not.toMatch(/[\u2014\u2013]/);
  });
  it("runs only the two static, hash-pinned scripts (no lead data inside them)", () => {
    const cfg = constructionConfig();
    cfg.businessName = "Zebra Unique Builders";
    const html = renderPreviewHtml(cfg);
    const csp = previewCsp(cfg);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(2);
    expect(html.match(/<script/g)).toHaveLength(2);
    for (const js of scripts) {
      expect(csp).toContain(`'sha256-${createHash("sha256").update(js, "utf8").digest("base64")}'`);
      expect(js).not.toContain("Zebra");
    }
    expect(csp).not.toContain("unsafe-inline' https://fonts.googleapis.com; script");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    // other templates keep the strict no-script policy
    expect(previewCsp(sampleConfig())).not.toContain("script-src");
    expect(renderPreviewHtml(sampleConfig())).not.toMatch(/<script/i);
  });
  it("marks unknown facts and services as placeholders", () => {
    const html = renderPreviewHtml(constructionConfig());
    expect(html).toContain("Sample service, confirmed with you before launch");
    expect(html).toContain("Years building");
    expect(html).toContain("Confirmed with you before launch");
  });
  it("escapes every dynamic value", () => {
    const cfg = constructionConfig();
    cfg.businessName = `<script>alert(1)</script>`;
    cfg.headline = `"><img src=x onerror=alert(1)>`;
    cfg.category = `<b>x</b>`;
    cfg.primaryCTA.href = "javascript:alert(1)";
    const html = renderPreviewHtml(cfg);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("javascript:");
  });
});

function sampleConfig() {
  return PreviewConfigSchema.parse({
    templateKey: "restaurant",
    businessName: "Luna",
    headline: "Luna",
    subheadline: "Restaurant in Lisbon",
    primaryCTA: { label: "Book", href: "tel:+351" },
    secondaryCTA: null,
    sections: [],
    colors: { primary: "#7c2d12", accent: "#d97706", background: "#fffbf5", surface: "#fdf2e3", text: "#1c1917" },
    fontPair: "playfair-inter",
    content: {
      about: null, offeringsTitle: "Menu", offerings: [], offeringsPlaceholder: ["Starters"], highlights: [], rating: null,
      contact: { phone: null, email: null, address: null, city: "Lisbon", country: "Portugal", mapQuery: null }, social: {},
    },
    images: { hero: null, gallery: [] },
    seo: { title: "Luna", description: "Luna" },
    generatedAt: new Date().toISOString(),
  });
}
