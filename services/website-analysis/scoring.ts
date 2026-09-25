import type { HtmlSignals } from "./htmlSignals";

export type WebsiteStatusValue =
  | "unknown" | "no_website" | "poor_website" | "outdated" | "good_website" | "excellent_website" | "unreachable";

export interface TechnicalFacts {
  https: boolean;
  sslValid: boolean | null;
  statusCode: number;
  responseTimeMs: number;
  redirectCount: number;
}

export interface WebsiteScore {
  technicalScore: number;
  contentScore: number;
  designScore: number;
  overallScore: number;
  status: WebsiteStatusValue;
  band: "excellent" | "good" | "needs_improvement" | "poor" | "very_poor";
  reasons: string[];
  outdatedSignals: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Deterministic website score (0-100). No AI involved. */
export function scoreWebsite(signals: HtmlSignals, tech: TechnicalFacts, now = new Date()): WebsiteScore {
  const reasons: string[] = [];
  const outdated: string[] = [];

  // ── technical (0-100)
  let technical = 100;
  if (!tech.https) { technical -= 30; reasons.push("Site is not served over HTTPS"); }
  else if (tech.sslValid === false) { technical -= 30; reasons.push("SSL certificate is invalid"); }
  if (tech.responseTimeMs > 4000) { technical -= 20; reasons.push(`Slow response (${(tech.responseTimeMs / 1000).toFixed(1)}s)`); }
  else if (tech.responseTimeMs > 2000) { technical -= 10; reasons.push(`Response time above 2s (${(tech.responseTimeMs / 1000).toFixed(1)}s)`); }
  if (tech.redirectCount > 2) { technical -= 5; reasons.push("Long redirect chain"); }
  if (signals.hasMixedContent) { technical -= 10; reasons.push("Mixed HTTP/HTTPS content"); }
  if (!signals.hasViewport) { technical -= 25; reasons.push("No mobile viewport — likely not mobile-friendly"); outdated.push("no mobile viewport"); }
  if (signals.usesFlash) { technical -= 25; reasons.push("Uses Flash"); outdated.push("Flash content"); }
  if (signals.usesLegacyJquery) { technical -= 5; outdated.push("legacy jQuery 1.x"); }

  // ── content (0-100)
  let content = 0;
  if (signals.title) content += 10; else reasons.push("Missing page title");
  if (signals.metaDescription) content += 10; else reasons.push("Missing meta description");
  if (signals.hasContactInformation) content += 20; else reasons.push("No contact information found");
  if (signals.hasClearCta) content += 15; else reasons.push("No clear call-to-action");
  if (signals.wordCount >= 300) content += 15; else if (signals.wordCount >= 100) content += 8; else reasons.push("Very little text content");
  if (signals.headingCount >= 3) content += 10;
  if (Object.keys(signals.socialLinks).length) content += 5;
  if (signals.hasStructuredData) content += 10;
  if (signals.hasMenu || signals.hasBooking) content += 5;

  // ── design heuristics (0-100)
  let design = 100;
  if (signals.usesTableLayout) { design -= 30; reasons.push("Table-based layout"); outdated.push("table layout"); }
  if (signals.inlineStyleRatio > 0.3) { design -= 15; outdated.push("heavy inline styling"); }
  if (!signals.hasFavicon) design -= 10;
  if (!signals.hasOpenGraph) design -= 10;
  if (signals.imageCount === 0) { design -= 20; reasons.push("No images"); }
  else if (signals.imagesWithoutAlt / signals.imageCount > 0.5) design -= 10;
  if (signals.copyrightYear && signals.copyrightYear <= now.getFullYear() - 3) {
    design -= 15;
    reasons.push(`Copyright notice last updated ${signals.copyrightYear}`);
    outdated.push(`copyright ${signals.copyrightYear}`);
  }

  technical = clamp(technical);
  content = clamp(content);
  design = clamp(design);
  let overall = clamp(technical * 0.35 + content * 0.4 + design * 0.25);

  if (signals.isParkedOrPlaceholder) {
    overall = Math.min(overall, 15);
    reasons.unshift("Domain appears parked or placeholder ('coming soon' / for sale)");
  }
  if (tech.statusCode >= 400) {
    overall = Math.min(overall, 10);
    reasons.unshift(`Website returned HTTP ${tech.statusCode}`);
  }

  const band = overall >= 90 ? "excellent" : overall >= 75 ? "good" : overall >= 50 ? "needs_improvement" : overall >= 25 ? "poor" : "very_poor";
  let status: WebsiteStatusValue;
  if (overall >= 90) status = "excellent_website";
  else if (overall >= 75) status = outdated.length >= 2 ? "outdated" : "good_website";
  else if (overall >= 50) status = outdated.length ? "outdated" : "poor_website";
  else status = "poor_website";

  return { technicalScore: technical, contentScore: content, designScore: design, overallScore: overall, status, band, reasons, outdatedSignals: outdated };
}
