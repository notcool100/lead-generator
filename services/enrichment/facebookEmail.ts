import { runActorSync } from "@/lib/apify";
import { normalizeBusinessName, normalizeEmail } from "@/lib/normalize";

/**
 * Finds a business's public contact email on its Facebook page — where most small
 * businesses without a website publish one. Both steps run Apify actors:
 *   1. apify/google-search-scraper  — finds the page (skipped when we already have the link)
 *   2. apify/facebook-pages-scraper — reads the page's "About" contact details
 */
export const GOOGLE_SEARCH_ACTOR = "apify/google-search-scraper";
export const FACEBOOK_PAGES_ACTOR = "apify/facebook-pages-scraper";

const NON_PAGE_PATHS = new Set([
  "posts", "groups", "events", "watch", "photo", "photo.php", "photos", "share", "sharer", "sharer.php", "login", "marketplace",
  "hashtag", "story.php", "permalink.php", "people", "public", "search", "reel", "reels", "videos", "pages", "help", "policies",
]);

/** Canonical Facebook page URL, or null for posts, groups, search pages etc. */
export function facebookPageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const [first, second] = u.pathname.split("/").filter(Boolean);
    if (!first) return null;
    if (first === "profile.php") {
      const id = u.searchParams.get("id");
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    if (NON_PAGE_PATHS.has(first.toLowerCase())) return null;
    // /p/<name-id> is the new page URL format.
    if (first === "p" && second) return `https://www.facebook.com/p/${second}`;
    return `https://www.facebook.com/${first}`;
  } catch {
    return null;
  }
}

/** True when most words of the business name appear in the search result. */
export function mentionsBusiness(businessName: string, text: string): boolean {
  const words = normalizeBusinessName(businessName).split(" ").filter((w) => w.length > 1);
  if (!words.length) return false;
  // Compare against the squashed text too, so "Bean There" matches facebook.com/beanthere.
  const hay = `${normalizeBusinessName(text)} ${text.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.6;
}

interface SearchPage {
  organicResults?: { url?: string; title?: string; description?: string }[];
}

interface FacebookPage {
  email?: string | null;
  intro?: string | null;
  info?: string[] | null;
  pageUrl?: string | null;
}

async function findFacebookPage(token: string, b: { businessName: string; city: string | null; country: string }): Promise<string | null> {
  const where = [b.city, b.country].filter(Boolean).join(" ");
  const pages = await runActorSync<SearchPage>(token, GOOGLE_SEARCH_ACTOR, {
    queries: `site:facebook.com "${b.businessName.replace(/"/g, "")}" ${where}`,
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
  });
  for (const r of pages.flatMap((p) => p.organicResults ?? [])) {
    const url = facebookPageUrl(r.url);
    if (url && mentionsBusiness(b.businessName, `${r.title ?? ""} ${r.url}`)) return url;
  }
  return null;
}

function emailFrom(page: FacebookPage): string | null {
  const direct = normalizeEmail(page.email);
  if (direct) return direct;
  const text = [page.intro, ...(page.info ?? [])].filter(Boolean).join(" ");
  return normalizeEmail(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]);
}

export async function findFacebookEmail(
  token: string,
  b: { businessName: string; city: string | null; country: string; facebookUrl?: string | null },
): Promise<{ email: string | null; facebookUrl: string | null }> {
  const facebookUrl = facebookPageUrl(b.facebookUrl) ?? (await findFacebookPage(token, b));
  if (!facebookUrl) return { email: null, facebookUrl: null };
  const [page] = await runActorSync<FacebookPage>(token, FACEBOOK_PAGES_ACTOR, { startUrls: [{ url: facebookUrl }] });
  return { email: page ? emailFrom(page) : null, facebookUrl };
}
