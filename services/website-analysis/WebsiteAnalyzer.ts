import { resolve4 } from "node:dns/promises";
import { isNonOfficialHost, normalizeBusinessName, normalizeUrl } from "@/lib/normalize";
import { errorMessage } from "@/lib/utils";
import { extractSignals, type HtmlSignals } from "./htmlSignals";
import { safeFetch, FetchBlockedError } from "./safeFetch";
import { scoreWebsite, type WebsiteScore, type WebsiteStatusValue } from "./scoring";

export interface WebsiteAnalysisInput {
  businessName: string;
  city?: string | null;
  country?: string | null;
  websiteUrl?: string | null;
  source?: string;
}

export interface WebsiteAnalysisResult {
  url: string | null;
  finalUrl: string | null;
  discovered: boolean;
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  sslValid: boolean | null;
  status: WebsiteStatusValue;
  reasons: string[];
  signals: HtmlSignals | null;
  score: WebsiteScore | null;
  candidatesTried: string[];
}

const COUNTRY_TLDS: Record<string, string> = {
  "united kingdom": "co.uk", uk: "co.uk", germany: "de", france: "fr", italy: "it", spain: "es", netherlands: "nl",
  portugal: "pt", ireland: "ie", australia: "com.au", canada: "ca", "new zealand": "co.nz", india: "in",
  nepal: "com.np", austria: "at", switzerland: "ch", belgium: "be", greece: "gr", poland: "pl", sweden: "se",
};

/** Candidate domains for a business with no listed website (bounded to keep it polite). */
export function candidateDomains(name: string, country?: string | null): string[] {
  const base = normalizeBusinessName(name).replace(/\s+/g, "");
  if (base.length < 4) return [];
  const tld = country ? COUNTRY_TLDS[country.toLowerCase()] : undefined;
  return [...new Set([`${base}.com`, tld ? `${base}.${tld}` : null].filter(Boolean) as string[])];
}

function pageMatchesBusiness(signals: HtmlSignals, html: string, input: WebsiteAnalysisInput) {
  const name = normalizeBusinessName(input.businessName);
  const words = name.split(" ").filter((w) => w.length > 2);
  const hay = normalizeBusinessName(`${signals.title ?? ""} ${html.slice(0, 200_000)}`);
  const nameHit = words.length > 0 && words.every((w) => hay.includes(w));
  const cityHit = !input.city || hay.includes(normalizeBusinessName(input.city));
  return nameHit && cityHit;
}

export class WebsiteAnalyzer {
  constructor(private readonly opts: { domainDiscovery: boolean } = { domainDiscovery: true }) {}

  async analyze(input: WebsiteAnalysisInput): Promise<WebsiteAnalysisResult> {
    const listed = normalizeUrl(input.websiteUrl);
    const candidatesTried: string[] = [];

    if (listed && isNonOfficialHost(new URL(listed).hostname)) {
      // A Facebook/Instagram page is a presence, but not an official website.
      const res = await this.discover(input, candidatesTried);
      if (res) return res;
      return this.noWebsite(listed, [`Only a third-party profile is listed (${new URL(listed).hostname}); no official website found`], candidatesTried);
    }

    if (listed) return this.check(listed, false, candidatesTried);
    if (input.websiteUrl?.trim()) {
      // A URL was listed but is not a valid web address: never claim "no website".
      return { ...this.noWebsite(input.websiteUrl, [`Listed website "${input.websiteUrl.slice(0, 100)}" is not a valid URL`], candidatesTried), status: "unknown" };
    }

    const discovered = await this.discover(input, candidatesTried);
    if (discovered) return discovered;
    const why = candidatesTried.length
      ? `No website listed by the data source; none of ${candidatesTried.length} candidate domain(s) (${candidatesTried.join(", ")}) belonged to this business`
      : "No website listed by the data source; domain discovery skipped";
    return this.noWebsite(null, [why], candidatesTried);
  }

  private noWebsite(url: string | null, reasons: string[], candidatesTried: string[]): WebsiteAnalysisResult {
    return {
      url, finalUrl: null, discovered: false, reachable: false, statusCode: null, responseTimeMs: null, sslValid: null,
      status: "no_website", reasons, signals: null, score: null, candidatesTried,
    };
  }

  private async discover(input: WebsiteAnalysisInput, tried: string[]): Promise<WebsiteAnalysisResult | null> {
    if (!this.opts.domainDiscovery || input.source === "mock") return null;
    for (const domain of candidateDomains(input.businessName, input.country)) {
      tried.push(domain);
      try {
        await resolve4(domain);
      } catch {
        continue; // no DNS → not this business
      }
      try {
        const res = await safeFetch(`https://${domain}`, { timeoutMs: 8000 });
        if (!res.ok) continue;
        const signals = extractSignals(res.body, res.finalUrl);
        if (signals.isParkedOrPlaceholder || !pageMatchesBusiness(signals, res.body, input)) continue;
        const result = await this.check(`https://${domain}`, true, tried);
        result.reasons.unshift(`Website discovered at ${domain} (not listed by data source)`);
        return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async check(url: string, discovered: boolean, candidatesTried: string[]): Promise<WebsiteAnalysisResult> {
    let res;
    let sslValid: boolean | null = null;
    try {
      res = await safeFetch(url);
      sslValid = res.finalUrl.startsWith("https:") ? true : null;
    } catch (err) {
      // An https failure may be a TLS problem — retry over http to distinguish "bad SSL" from "down".
      const msg = errorMessage(err);
      if (err instanceof FetchBlockedError) {
        return { ...this.noWebsite(url, [`URL blocked: ${msg}`], candidatesTried), status: "unreachable" };
      }
      if (url.startsWith("https:")) {
        try {
          res = await safeFetch(url.replace(/^https:/, "http:"));
          sslValid = false;
        } catch {
          /* fall through */
        }
      }
      if (!res) {
        return {
          url, finalUrl: null, discovered, reachable: false, statusCode: null, responseTimeMs: null, sslValid: null,
          status: "unreachable", reasons: [`Website could not be reached: ${msg}`], signals: null, score: null, candidatesTried,
        };
      }
    }

    if (res.status >= 500) {
      return {
        url, finalUrl: res.finalUrl, discovered, reachable: false, statusCode: res.status, responseTimeMs: res.responseTimeMs, sslValid,
        status: "unreachable", reasons: [`Website returned server error ${res.status}`], signals: null, score: null, candidatesTried,
      };
    }

    const signals = extractSignals(res.body, res.finalUrl);
    const score = scoreWebsite(signals, {
      https: res.finalUrl.startsWith("https:"),
      sslValid,
      statusCode: res.status,
      responseTimeMs: res.responseTimeMs,
      redirectCount: res.redirects.length,
    });

    return {
      url, finalUrl: res.finalUrl, discovered, reachable: res.status < 400, statusCode: res.status,
      responseTimeMs: res.responseTimeMs, sslValid, status: score.status, reasons: score.reasons, signals, score, candidatesTried,
    };
  }
}
