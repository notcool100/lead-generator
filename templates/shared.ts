import { icon } from "./icons";
import type { ImageRef } from "@/types/preview";

/** Helpers shared by every preview renderer. All dynamic values go through esc(). */

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function safeHref(href: string): string {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(h)) return esc(h);
  return "#visit";
}

// ───────────────────────── colour helpers ─────────────────────────

export const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
export function luminance(h: string) {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isDark = (h: string) => luminance(h) < 0.2;
export const onColor = (h: string) => (luminance(h) > 0.4 ? "#141414" : "#fafafa");

// ───────────────────────── images ─────────────────────────

export function srcset(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "images.unsplash.com") {
      return [640, 960, 1400, 2000]
        .map((w) => {
          u.searchParams.set("w", String(w));
          u.searchParams.set("q", "80");
          u.searchParams.set("auto", "format");
          u.searchParams.set("fit", "crop");
          return `${u.toString()} ${w}w`;
        })
        .join(", ");
    }
    if (u.hostname === "images.pexels.com") {
      return [640, 960, 1400, 2000]
        .map((w) => {
          u.searchParams.set("auto", "compress");
          u.searchParams.set("cs", "tinysrgb");
          u.searchParams.set("w", String(w));
          return `${u.toString()} ${w}w`;
        })
        .join(", ");
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function picture(img: ImageRef | null, opts: { cls?: string; sizes?: string; eager?: boolean; label?: string; variant?: number } = {}) {
  if (!img) {
    return `<div class="ph ph-${(opts.variant ?? 0) % 4} ${opts.cls ?? ""}" role="img" aria-label="${esc(opts.label ?? "Photo placeholder")}">${icon("sparkle", "ph-icon")}</div>`;
  }
  const set = srcset(img.url);
  return `<img class="${opts.cls ?? ""}" src="${esc(img.url)}"${set ? ` srcset="${esc(set)}" sizes="${esc(opts.sizes ?? "100vw")}"` : ""} alt="${esc(img.alt)}" ${opts.eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`;
}

/** Photographer credits for the footer (deduplicated). */
export function photoCredits(images: (ImageRef | null)[], max = 8): string {
  const seen = new Set<string>();
  return images
    .filter((i): i is ImageRef => Boolean(i?.attribution) && !seen.has(i!.attribution!) && Boolean(seen.add(i!.attribution!)))
    .slice(0, max)
    .map((i) => (i.attributionUrl ? `<a href="${esc(i.attributionUrl)}" rel="noopener" target="_blank">${esc(i.attribution)}</a>` : esc(i.attribution)))
    .join(", ");
}

// ───────────────────────── small pieces ─────────────────────────

export function stars(value: number) {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    out.push(value >= i - 0.25 ? icon("star", "star") : value >= i - 0.75 ? icon("starHalf", "star") : icon("starEmpty", "star star-empty"));
  }
  return `<span class="stars" aria-label="${value.toFixed(1)} out of 5">${out.join("")}</span>`;
}

/** Simple monogram mark (one or two initials in a circle). */
export function monogram(name: string) {
  const letters = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return `<span class="mark" aria-hidden="true">${esc(letters || "*")}</span>`;
}

