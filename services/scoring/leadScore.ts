/**
 * Lead score (0-100): how promising a lead is for a website-building offer.
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
}

const WEBSITE_POINTS: Record<string, number> = {
  no_website: 40, poor_website: 35, outdated: 30, unreachable: 25, unknown: 10, good_website: 8, excellent_website: 0,
};

export function scoreLead(i: LeadScoreInput): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {
    website: WEBSITE_POINTS[i.websiteStatus] ?? 10,
    email: i.email ? 20 : 0,
    phone: i.phone ? 5 : 0,
    rating: i.rating == null ? 0 : i.rating >= 4.3 ? 10 : i.rating >= 3.8 ? 6 : 2,
    activity: i.reviewCount == null ? 0 : i.reviewCount >= 100 ? 15 : i.reviewCount >= 25 ? 10 : i.reviewCount >= 5 ? 5 : 0,
    address: i.address ? 5 : 0,
    social: i.hasSocial ? 5 : 0,
  };
  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown };
}
