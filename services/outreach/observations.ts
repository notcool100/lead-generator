/**
 * Verified observations: factual statements derived ONLY from our own website
 * check and provider data. Both the AI and deterministic templates may only
 * reference these — this is what prevents fabricated claims such as
 * "you don't have a website" when we never verified it.
 */
export interface ObservationInput {
  businessName: string;
  websiteStatus: string;
  websiteUrl: string | null;
  reasons: string[];
  rating: number | null;
  reviewCount: number | null;
  checkPerformed: boolean;
  mobileFriendly: boolean | null;
  hasBooking: boolean | null;
  hasMenu: boolean | null;
  category: string;
}

export function buildVerifiedObservations(i: ObservationInput): string[] {
  const out: string[] = [];
  if (!i.checkPerformed) return out;
  const host = i.websiteUrl ? safeHost(i.websiteUrl) : null;

  switch (i.websiteStatus) {
    case "no_website":
      out.push(`I couldn't find a website for ${i.businessName} — just directory and map listings`);
      break;
    case "unreachable":
      if (host) out.push(`the website listed for ${i.businessName} (${host}) didn't load when I tried it`);
      break;
    case "poor_website":
    case "outdated": {
      if (i.mobileFriendly === false && host) out.push(`${host} isn't set up for mobile screens, which is where most people look up local businesses`);
      const r = i.reasons.find((x) => /copyright notice last updated/i.test(x));
      if (r && host) out.push(`${host} looks like it hasn't been updated in a while (${r.toLowerCase()})`);
      if (i.hasBooking === false && ["restaurant", "hotel", "salon", "dentist", "gym", "spa"].some((c) => i.category.toLowerCase().includes(c)) && host)
        out.push(`${host} doesn't offer a way to book or reserve online`);
      if (/not served over https/i.test(i.reasons.join(" ")) && host) out.push(`${host} isn't served over a secure (HTTPS) connection, so browsers show a "Not secure" warning`);
      if (!out.length && host) out.push(`${host} could do more to turn visitors into customers`);
      break;
    }
  }
  if (i.rating && i.reviewCount && i.rating >= 4.2 && i.reviewCount >= 20) {
    out.push(`${i.businessName} has a ${i.rating.toFixed(1)}-star rating from ${i.reviewCount} reviews`);
  }
  return out;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
