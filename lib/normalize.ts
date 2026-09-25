/**
 * Normalisation helpers used for de-duplication. Pure functions — unit tested.
 */

const NAME_STOPWORDS = new Set([
  "the", "and", "restaurant", "cafe", "café", "bar", "hotel", "ltd", "llc", "inc", "gmbh", "co", "srl", "sa",
]);

export function normalizeBusinessName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .join(" ")
    .trim();
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  street: "st", str: "st", strasse: "st", straße: "st", avenue: "ave", av: "ave", road: "rd",
  boulevard: "blvd", drive: "dr", lane: "ln", place: "pl", square: "sq", suite: "ste",
};

export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const out = address
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => ADDRESS_ABBREVIATIONS[w] ?? w)
    .join(" ")
    .trim();
  return out || null;
}

/** Returns a canonical URL (https assumed when no scheme) or null if not parseable. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const h = u.hostname;
    if (!h.includes(".") && h !== "localhost" && !/^\[?[0-9a-f:]+\]?$/i.test(h)) return null;
    u.hash = "";
    // drop common tracking parameters
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Social / directory hosts are not an "official website". */
const NON_OFFICIAL_HOSTS = [
  "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com", "linkedin.com",
  "yelp.com", "tripadvisor.com", "google.com", "goo.gl", "linktr.ee", "booking.com",
  "ubereats.com", "doordash.com", "deliveroo.", "just-eat.", "wa.me", "whatsapp.com",
];

export function isNonOfficialHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return NON_OFFICIAL_HOSTS.some((d) => h === d || h.endsWith(`.${d}`) || (d.endsWith(".") && h.includes(d)));
}

export function extractDomain(url: string | null | undefined): string | null {
  const n = normalizeUrl(url);
  if (!n) return null;
  return new URL(n).hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
