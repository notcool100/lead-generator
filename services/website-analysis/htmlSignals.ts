import * as cheerio from "cheerio";

/**
 * Pure HTML inspection — no network, no AI. Produces the signals the scorer uses.
 */
export interface HtmlSignals {
  title: string | null;
  metaDescription: string | null;
  hasViewport: boolean;
  hasContactInformation: boolean;
  emails: string[];
  phones: string[];
  hasMenu: boolean;
  hasBooking: boolean;
  socialLinks: Record<string, string>;
  hasClearCta: boolean;
  /** A contact / quote form (native form with a message or email field, or a known form embed). */
  hasContactForm: boolean;
  /** The page says which areas the business serves. */
  mentionsServiceArea: boolean;
  hasOpenGraph: boolean;
  hasFavicon: boolean;
  hasStructuredData: boolean;
  headingCount: number;
  imageCount: number;
  imagesWithoutAlt: number;
  wordCount: number;
  copyrightYear: number | null;
  usesTableLayout: boolean;
  usesFlash: boolean;
  usesLegacyJquery: boolean;
  inlineStyleRatio: number;
  hasMixedContent: boolean;
  isParkedOrPlaceholder: boolean;
  generator: string | null;
}

const SOCIAL = ["facebook", "instagram", "tiktok", "twitter", "x", "linkedin", "youtube", "tripadvisor", "yelp"];

export function extractSignals(html: string, pageUrl: string): HtmlSignals {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const htmlLower = html.toLowerCase();

  const emails = new Set<string>();
  $('a[href^="mailto:"]').each((_, el) => {
    const v = ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (v) emails.add(v);
  });
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) emails.add(m[0].toLowerCase());

  const phones = new Set<string>();
  $('a[href^="tel:"]').each((_, el) => {
    const v = ($(el).attr("href") ?? "").replace(/^tel:/i, "").trim();
    if (v) phones.add(v);
  });

  const socialLinks: Record<string, string> = {};
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const host = new URL(href, pageUrl).hostname.replace(/^www\./, "");
      for (const s of SOCIAL) {
        if (host === `${s}.com` && !socialLinks[s]) socialLinks[s] = new URL(href, pageUrl).toString();
      }
    } catch {
      /* ignore malformed hrefs */
    }
  });

  const linkAndButtonText = $("a, button").map((_, el) => $(el).text().toLowerCase().trim()).get().join(" | ");
  const ctaWords = /(book|reserve|order|call now|contact us|get in touch|schedule|appointment|buy|join|sign up|get started|enquire|inquire)/;

  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const allEls = $("*").length || 1;

  return {
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    hasViewport: $('meta[name="viewport"]').length > 0,
    hasContactInformation: emails.size > 0 || phones.size > 0 || /contact|kontakt|contacto|address|adresse/.test(lower),
    emails: [...emails].slice(0, 10),
    phones: [...phones].slice(0, 10),
    hasMenu: /\bmenu\b|speisekarte|carta|menú|our dishes|food & drink/.test(lower) || $('a[href*="menu"]').length > 0,
    hasBooking: /book(ing)? (a table|now|online)|reserv(e|ation)|opentable|resy|booking\.com|calendly|appointment/.test(lower + htmlLower.slice(0, 200_000)),
    socialLinks,
    hasClearCta: ctaWords.test(linkAndButtonText),
    hasContactForm:
      $("form").filter((_, f) => $(f).find('textarea, input[type="email"], input[name*="message" i], input[name*="phone" i]').length > 0).length > 0 ||
      /wpcf7|formspree|typeform\.com|jotform|docs\.google\.com\/forms|hsforms|wufoo|tally\.so|fluentform|gform_/.test(htmlLower),
    mentionsServiceArea: /service areas?|areas (we )?serve|we serve|serving (the )?[a-z]+|we cover|coverage area|proudly serving/.test(lower),
    hasOpenGraph: $('meta[property^="og:"]').length > 0,
    hasFavicon: $('link[rel*="icon"]').length > 0,
    hasStructuredData: $('script[type="application/ld+json"]').length > 0,
    headingCount: $("h1, h2, h3").length,
    imageCount: $("img").length,
    imagesWithoutAlt: $("img:not([alt]), img[alt='']").length,
    wordCount: text ? text.split(" ").length : 0,
    copyrightYear: years.length ? Math.max(...years) : null,
    usesTableLayout: $("table").length > 0 && $("table table, table[width], td[width]").length > 2,
    usesFlash: /\.swf|shockwave-flash|<embed[^>]+flash/.test(htmlLower),
    usesLegacyJquery: /jquery[.-]?1\.[0-9]+/.test(htmlLower),
    inlineStyleRatio: $("[style]").length / allEls,
    hasMixedContent: pageUrl.startsWith("https:") && /(src|href)=["']http:\/\//.test(htmlLower),
    isParkedOrPlaceholder: /domain (is )?for sale|this domain (may be|is) (for sale|parked)|coming soon|under construction|parked free|godaddy\.com\/park/.test(lower) && text.length < 2000,
    generator: $('meta[name="generator"]').attr("content") ?? null,
  };
}
