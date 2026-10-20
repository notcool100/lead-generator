/**
 * The monthly website + lead-generation package. Analysis picks the subset of
 * these features that fits a business; previews, emails and calls describe it.
 */
export const PACKAGE_FEATURES = [
  "Complete multi-page website with all content written for you",
  "Mobile-responsive design",
  "Hosting and SSL",
  "Business contact information",
  "Click-to-call button",
  "Contact / request-a-quote form",
  "Request a Free Estimate call-to-action",
  "Google Maps location",
  "Services section",
  "Reviews / testimonials",
  "Before-and-after gallery",
  "Service-area information",
  "Basic SEO structure",
  "Basic analytics",
  "Lead notifications",
  "Simple AI FAQ chatbot",
] as const;

export type PackageFeature = (typeof PACKAGE_FEATURES)[number];

/** Always included regardless of business type. */
export const CORE_PACKAGE_FEATURES: PackageFeature[] = [
  "Complete multi-page website with all content written for you",
  "Mobile-responsive design",
  "Hosting and SSL",
  "Business contact information",
  "Basic SEO structure",
  "Basic analytics",
  "Lead notifications",
];

/** Wording used by earlier versions of the offer, rewritten when settings are read. */
const LEGACY_INCLUDES: Record<string, string> = {
  "Professional 5–7 page website": "Complete multi-page website with all content written for you",
  "Small content updates": "Full website content and ongoing content updates",
};

export function upgradeLegacyIncludes(includes: string[]): string[] {
  return includes.map((x) => LEGACY_INCLUDES[x] ?? x);
}

/** "$110/month" (falls back to "NPR 110/month" style for unknown currency codes). */
export function formatMonthlyPrice(offer: { monthlyPrice: number; currency: string }): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: offer.currency.toUpperCase(),
      maximumFractionDigits: Number.isInteger(offer.monthlyPrice) ? 0 : 2,
    }).format(offer.monthlyPrice);
  } catch {
    amount = `${offer.currency} ${offer.monthlyPrice}`;
  }
  return `${amount}/month`;
}
