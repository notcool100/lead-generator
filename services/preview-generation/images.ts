import { logger } from "@/lib/logger";
import type { ImageRef } from "@/types/preview";

/**
 * Licensed stock imagery. Only Unsplash (Unsplash License, attribution kept)
 * is used; without a key the template falls back to generated patterns.
 * Images from the business's own site/listings are NEVER copied automatically.
 */
export async function findStockImages(query: string, count: number): Promise<ImageRef[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ query, per_page: String(count), orientation: "landscape", content_filter: "high" });
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const data = (await res.json()) as {
      results: { urls: { regular: string }; alt_description: string | null; user: { name: string; links: { html: string } }; links: { html: string } }[];
    };
    return data.results.map((r) => ({
      url: r.urls.regular,
      alt: r.alt_description ?? query,
      source: "unsplash",
      license: "Unsplash License (https://unsplash.com/license)",
      attribution: `${r.user.name} on Unsplash`,
      attributionUrl: `${r.user.links.html}?utm_source=lead_generator&utm_medium=referral`,
    }));
  } catch (err) {
    logger.warn({ err, query }, "stock image lookup failed; using patterns");
    return [];
  }
}
