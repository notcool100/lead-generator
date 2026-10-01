/**
 * Lead score (0-100): how promising a lead is for the monthly website +
 * lead-generation service. Only objective, verifiable factors count — each
 * point awarded comes with a human-readable factor shown on the dashboard.
 * Pure function — unit tested.
 */
export interface LeadScoreInput {
  websiteStatus: string;
  email: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
  hasSocial: boolean;
  /** Signals from our own website check; null = not checked / no site. */
  mobileFriendly?: boolean | null;
  hasClearCta?: boolean | null;
  hasContactForm?: boolean | null;
  mentionsServiceArea?: boolean | null;
  category?: string;
}

const WEBSITE_POINTS: Record<string, number> = {
  no_website: 40, poor_website: 30, outdated: 28, unreachable: 25, unknown: 10, good_website: 5, excellent_website: 0,
};

const WEBSITE_FACTOR: Record<string, string> = {
  no_website: "No website found",
  poor_website: "Website scored poorly in our check",
  outdated: "Website shows outdated technology or content",
  unreachable: "Listed website did not load",
};

/** Businesses where customers look for "do you cover my area?" (trades, home services…). */
const SERVICE_AREA_CATEGORIES = /plumb|electric|roof|clean|landscap|garden|hvac|heating|cooling|paint|contractor|construct|repair|handyman|pest|mov(ing|ers)|locksmith|carpet|pool|remodel|fenc|tree|gutter|window|flooring|solar|auto|towing|real estate|professional/i;

export function scoreLead(i: LeadScoreInput): { score: number; breakdown: Record<string, number>; factors: string[] } {
  const factors: string[] = [];
  const siteChecked = !["no_website", "unreachable", "unknown"].includes(i.websiteStatus);

  const website = WEBSITE_POINTS[i.websiteStatus] ?? 10;
  if (WEBSITE_FACTOR[i.websiteStatus]) factors.push(WEBSITE_FACTOR[i.websiteStatus]);

  let deficiencies = 0;
  if (siteChecked) {
    if (i.mobileFriendly === false) { deficiencies += 6; factors.push("Website is not mobile-friendly"); }
    if (i.hasClearCta === false) { deficiencies += 4; factors.push("No clear call-to-action on the website"); }
    if (i.hasContactForm === false) { deficiencies += 4; factors.push("No contact or quote form on the website"); }
    if (i.mentionsServiceArea === false && i.category && SERVICE_AREA_CATEGORIES.test(i.category)) {
      deficiencies += 3;
      factors.push("Website doesn't state a service area");
    }
  }
  deficiencies = Math.min(deficiencies, 15);

  const weakPresence = !i.hasSocial && (i.reviewCount ?? 0) < 10;
  if (weakPresence) factors.push("Weak online presence (no social profiles, under 10 reviews)");

  const breakdown: Record<string, number> = {
    website,
    deficiencies,
    email: i.email ? 15 : 0,
    phone: i.phone ? 5 : 0,
    rating: i.rating == null ? 0 : i.rating >= 4.3 ? 10 : i.rating >= 3.8 ? 6 : 2,
    activity: i.reviewCount == null ? 0 : i.reviewCount >= 100 ? 10 : i.reviewCount >= 25 ? 7 : i.reviewCount >= 5 ? 4 : 0,
    address: i.address ? 3 : 0,
    presence: weakPresence ? 4 : 0,
  };
  if (i.email) factors.push("Public email address available");
  if (i.phone) factors.push("Public phone number available");
  if (i.rating != null && i.rating >= 4.3) factors.push(`Strong ${i.rating.toFixed(1)}★ rating`);
  if ((i.reviewCount ?? 0) >= 25) factors.push(`Active business (${i.reviewCount} reviews)`);

  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown, factors };
}
