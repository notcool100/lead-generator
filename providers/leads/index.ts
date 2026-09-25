import { env } from "@/lib/env";
import { getAIProvider } from "@/providers/ai";
import { ClaudeCodeProvider } from "@/providers/ai/ClaudeCodeProvider";
import type { LeadProvider } from "./LeadProvider";
import { GooglePlacesProvider } from "./GooglePlacesProvider";
import { YelpProvider } from "./YelpProvider";
import { MockLeadProvider } from "./MockLeadProvider";
import { OpenStreetMapProvider } from "./OpenStreetMapProvider";
import { WebSearchLeadProvider } from "./WebSearchLeadProvider";
import { MultiLeadProvider } from "./MultiLeadProvider";

export const LEAD_SOURCES = [
  { key: "google_places", label: "Google Maps (Places API)", description: "Ratings, reviews, phone and website from Google Maps. Needs GOOGLE_PLACES_API_KEY." },
  { key: "openstreetmap", label: "OpenStreetMap", description: "Free live map data, no key. Coverage varies by city." },
  { key: "web_search", label: "Claude web search", description: "Claude searches Maps listings, directories, review sites and social pages. Uses your Claude subscription (claude_code)." },
  { key: "yelp", label: "Yelp", description: "Needs YELP_API_KEY." },
  { key: "mock", label: "Sample data (dev)", description: "Synthetic businesses for testing." },
] as const;
export type LeadSourceKey = (typeof LEAD_SOURCES)[number]["key"];

/** Whether a source can run with the current configuration (and why not). */
export function sourceAvailability(key: string): { ok: boolean; reason?: string } {
  const e = env();
  switch (key) {
    case "google_places":
      return e.GOOGLE_PLACES_API_KEY || (e.LEAD_PROVIDER_API_KEY && e.LEAD_PROVIDER.includes("google")) ? { ok: true } : { ok: false, reason: "GOOGLE_PLACES_API_KEY not set" };
    case "yelp":
      return e.YELP_API_KEY ? { ok: true } : { ok: false, reason: "YELP_API_KEY not set" };
    case "web_search":
      return getAIProvider() instanceof ClaudeCodeProvider ? { ok: true } : { ok: false, reason: "requires AI_PROVIDER=claude_code" };
    case "mock":
      return e.NODE_ENV === "production" ? { ok: false, reason: "disabled in production" } : { ok: true };
    case "openstreetmap":
      return { ok: true };
    default:
      return { ok: false, reason: "unknown source" };
  }
}

function build(key: string): LeadProvider {
  const e = env();
  switch (key) {
    case "google_places":
      return new GooglePlacesProvider(e.GOOGLE_PLACES_API_KEY ?? e.LEAD_PROVIDER_API_KEY ?? "");
    case "yelp":
      return new YelpProvider(e.YELP_API_KEY ?? "");
    case "openstreetmap":
      return new OpenStreetMapProvider(e.OVERPASS_URLS.split(",").map((s) => s.trim()).filter(Boolean), e.OSM_CONTACT ?? e.APP_URL);
    case "web_search": {
      const ai = getAIProvider();
      if (!(ai instanceof ClaudeCodeProvider)) throw new Error("web_search lead source requires AI_PROVIDER=claude_code");
      return new WebSearchLeadProvider(ai);
    }
    case "mock":
      return new MockLeadProvider();
    default:
      throw new Error(`Unknown lead source: ${key}`);
  }
}

/** Builds the provider chain for the given sources (campaign setting) or LEAD_PROVIDER. */
export function getLeadProvider(sources?: string[]): LeadProvider {
  const keys = (sources?.length ? sources : env().LEAD_PROVIDER.split(",")).map((s) => s.trim()).filter(Boolean);
  const usable = keys.filter((k) => sourceAvailability(k).ok);
  if (!usable.length) {
    throw new Error(`No usable lead source among [${keys.join(", ")}]: ${keys.map((k) => `${k} (${sourceAvailability(k).reason})`).join("; ")}`);
  }
  const providers = usable.map(build);
  return providers.length === 1 ? providers[0] : new MultiLeadProvider(providers);
}

export type { LeadProvider };
