import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ImageQueries } from "@/templates/registry";
import type { ImageRef } from "@/types/preview";

/**
 * Licensed stock photography for previews.
 *  - Unsplash API (UNSPLASH_ACCESS_KEY): Unsplash License, hotlinked, photographer credited,
 *    download endpoint triggered when a photo is used (Unsplash API guidelines).
 *  - Pexels API (PEXELS_API_KEY): Pexels License, photographer credited.
 * Photos from the business's own website or listings are NEVER copied.
 * Without a key the templates render on-brand placeholders.
 */

interface Candidate extends ImageRef {
  id: string;
  downloadLocation?: string;
}

const CACHE_DAYS = 7;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = await prisma.aiCache.findUnique({ where: { key } }).catch(() => null);
  if (hit && Date.now() - hit.createdAt.getTime() < CACHE_DAYS * 86_400_000) return hit.response as T;
  const value = await load();
  await prisma.aiCache
    .upsert({ where: { key }, create: { key, model: "images", response: value as object }, update: { response: value as object, createdAt: new Date() } })
    .catch(() => undefined);
  return value;
}

async function searchUnsplash(query: string, key: string): Promise<Candidate[]> {
  return cached(`img:unsplash:${query}`, async () => {
    const params = new URLSearchParams({ query, per_page: "20", orientation: "landscape", content_filter: "high" });
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const data = (await res.json()) as {
      results: { id: string; urls: { raw: string }; alt_description: string | null; user: { name: string; links: { html: string } }; links: { download_location: string } }[];
    };
    return data.results.map((r) => ({
      id: `u:${r.id}`,
      url: `${r.urls.raw}${r.urls.raw.includes("?") ? "&" : "?"}w=1600&q=80&auto=format&fit=crop`,
      alt: r.alt_description ?? query,
      source: "unsplash",
      license: "Unsplash License (https://unsplash.com/license)",
      attribution: `${r.user.name} on Unsplash`,
      attributionUrl: `${r.user.links.html}?utm_source=lead_generator&utm_medium=referral`,
      downloadLocation: r.links.download_location,
    }));
  });
}

async function searchPexels(query: string, key: string): Promise<Candidate[]> {
  return cached(`img:pexels:${query}`, async () => {
    const params = new URLSearchParams({ query, per_page: "20", orientation: "landscape" });
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = (await res.json()) as { photos: { id: number; alt: string; photographer: string; photographer_url: string; src: { original: string } }[] };
    return data.photos.map((p) => ({
      id: `p:${p.id}`,
      url: `${p.src.original}?auto=compress&cs=tinysrgb&w=1600`,
      alt: p.alt || query,
      source: "pexels",
      license: "Pexels License (https://www.pexels.com/license/)",
      attribution: `${p.photographer} on Pexels`,
      attributionUrl: p.photographer_url,
    }));
  });
}

async function search(query: string): Promise<Candidate[]> {
  const unsplash = process.env.UNSPLASH_ACCESS_KEY;
  const pexels = process.env.PEXELS_API_KEY;
  for (const [name, fn] of [
    ["unsplash", unsplash ? () => searchUnsplash(query, unsplash) : null],
    ["pexels", pexels ? () => searchPexels(query, pexels) : null],
  ] as const) {
    if (!fn) continue;
    try {
      const r = await fn();
      if (r.length) return r;
    } catch (err) {
      logger.warn({ err: String(err), provider: name, query }, "stock image search failed");
    }
  }
  return [];
}

export function stockImagesConfigured() {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY || process.env.PEXELS_API_KEY);
}

/** Tells Unsplash a photo was used (required by the API guidelines). Fire-and-forget. */
function trackDownloads(used: Candidate[]) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return;
  for (const c of used) {
    if (!c.downloadLocation) continue;
    fetch(c.downloadLocation, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  }
}

/**
 * Picks photos for every page role. The seed (business name) rotates choices so
 * businesses in the same category get different photos.
 * Returns { hero, gallery } with gallery ordered as the renderer expects:
 * about, about-2, band, offers x3, gallery x4, visit.
 */
export async function findPreviewImages(queries: ImageQueries, seed: string): Promise<{ hero: ImageRef | null; gallery: ImageRef[] }> {
  if (!stockImagesConfigured()) return { hero: null, gallery: [] };
  const [hero, ambience, detail, people] = await Promise.all([search(queries.hero), search(queries.ambience), search(queries.detail), search(queries.people)]);
  const offset = parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 6), 16);
  const used = new Set<string>();
  const take = (list: Candidate[], n: number): Candidate | null => {
    if (!list.length) return null;
    for (let i = 0; i < list.length; i++) {
      const c = list[(offset + n * 3 + i) % list.length];
      if (!used.has(c.id)) {
        used.add(c.id);
        return c;
      }
    }
    return null;
  };
  const heroImg = take(hero, 0) ?? take(ambience, 0);
  const plan: [Candidate[], number][] = [
    [ambience, 0], [detail, 0], [ambience, 1], // about, about-2, band
    [detail, 1], [detail, 2], [people, 0], // offers
    [ambience, 2], [people, 1], [detail, 3], [hero, 1], // gallery
    [hero, 2], // visit
  ];
  const gallery = plan.map(([list, n]) => take(list, n) ?? take(ambience, n + 4) ?? take(hero, n + 4)).filter((c): c is Candidate => Boolean(c));
  const chosen = [heroImg, ...gallery].filter((c): c is Candidate => Boolean(c));
  trackDownloads(chosen);
  const strip = ({ id: _id, downloadLocation: _d, ...ref }: Candidate): ImageRef => (void _id, void _d, ref);
  return { hero: heroImg ? strip(heroImg) : null, gallery: gallery.map(strip) };
}
