import { z } from "zod";
import { registerMockHandler } from "@/providers/ai/MockAIProvider";
import { CORE_PACKAGE_FEATURES, PACKAGE_FEATURES } from "@/lib/offer";
import { factsBlock, NO_FABRICATION_RULES, readFacts } from "./shared";

export const BusinessAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  websiteOpportunity: z.string().min(1).max(1200),
  strengths: z.array(z.string().max(300)).max(8),
  weaknesses: z.array(z.string().max(300)).max(8),
  recommendedFeatures: z.array(z.string().max(200)).max(10),
  recommendedSections: z.array(z.string().max(60)).max(12),
  tone: z.string().max(80),
  primaryCTA: z.string().max(60),
  secondaryCTA: z.string().max(60).nullable(),
  targetAudience: z.string().max(400).nullable(),
  /** Services the facts show the business offers (category/description/website title only). */
  services: z.array(z.string().max(80)).max(10).default([]),
  /** Area served, only if stated in facts (otherwise null). */
  serviceArea: z.string().max(200).nullable().default(null),
  /** Concrete improvement opportunities, each tied to a fact in website.issues / website flags / listing data. */
  opportunities: z.array(z.string().max(300)).max(8).default([]),
  /** Package features that make sense for this business. */
  packageFeatures: z.array(z.enum(PACKAGE_FEATURES)).max(PACKAGE_FEATURES.length).default([]),
  confidence: z.number().min(0).max(1),
});
export type BusinessAnalysis = z.infer<typeof BusinessAnalysisSchema>;

export interface BusinessFacts {
  businessName: string;
  category: string;
  location: { city: string | null; region: string | null; country: string; address: string | null };
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  phonePresent: boolean;
  emailPresent: boolean;
  socialProfiles: string[];
  website: {
    status: string;
    url: string | null;
    overallScore: number | null;
    issues: string[];
    hasBooking: boolean | null;
    hasMenu: boolean | null;
    mobileFriendly: boolean | null;
    hasClearCta: boolean | null;
    hasContactForm: boolean | null;
    mentionsServiceArea: boolean | null;
    pageTitle: string | null;
    metaDescription: string | null;
  };
}

export const BUSINESS_ANALYSIS_SYSTEM = `You are a senior web strategist assessing local businesses for a studio that sells a professionally managed website + lead-generation service on a monthly plan.
Given verified facts about one business, produce a concise business profile and online-presence opportunity assessment.

${NO_FABRICATION_RULES}
- Strengths and weaknesses must each be traceable to a specific fact (e.g. rating, review count, a website issue).
- opportunities: concrete, verifiable improvements, each tied to a fact (website.status, website.issues, a website flag that is false, missing social profiles, few reviews). Website flags that are null were NOT checked — make no claim about them.
- Never claim the business is losing customers, missing revenue or "falling behind" — there is no evidence of that. Describe what is missing, not its imagined consequences.
- services: only services evident from category, description or pageTitle. Empty array if none are stated beyond the category.
- serviceArea: only if a location/area served is evident from the facts (city or region is acceptable as "<city> area"); otherwise null.
- packageFeatures: choose only the features from this list that make sense for this specific business: ${PACKAGE_FEATURES.join("; ")}.
  Always include: ${CORE_PACKAGE_FEATURES.join("; ")}. Include "Before-and-after gallery" only for trades/visual-result businesses (cleaning, renovation, landscaping, salons, auto detailing…), "Request a Free Estimate call-to-action" and "Service-area information" only for businesses that travel to customers or quote jobs, and "Simple AI FAQ chatbot" only when customers typically ask repeated questions.
- recommendedFeatures and recommendedSections describe what a new website SHOULD include (e.g. "Online table booking", "Location map"); these are recommendations, not claims about the business.
- confidence (0-1) reflects how complete the facts are; lower it when data is sparse.
- Write in plain, professional English.`;

export function businessAnalysisPrompt(facts: BusinessFacts) {
  return `Analyse this business and return the JSON profile.\n\n${factsBlock(facts)}`;
}

const DEFAULT_SECTIONS: Record<string, string[]> = {
  restaurant: ["Hero", "About", "Menu", "Gallery", "Reservations", "Location", "Contact"],
  cafe: ["Hero", "About", "Menu", "Gallery", "Location", "Contact"],
  hotel: ["Hero", "Rooms", "Amenities", "Gallery", "Location", "Booking", "Contact"],
  salon: ["Hero", "Services", "Gallery", "Booking", "Location", "Contact"],
  gym: ["Hero", "Classes", "Memberships", "Gallery", "Location", "Contact"],
  dentist: ["Hero", "Treatments", "About the practice", "Appointments", "Location", "Contact"],
};

// Offline fallback: fact-only analysis (used when no AI key is configured).
registerMockHandler("business_analysis", (prompt) => {
  const f = readFacts<BusinessFacts>(prompt);
  const cat = f.category.toLowerCase();
  const key = Object.keys(DEFAULT_SECTIONS).find((k) => cat.includes(k)) ?? "restaurant";
  const strengths: string[] = [];
  if (f.rating && f.rating >= 4) strengths.push(`Strong ${f.rating.toFixed(1)}-star rating${f.reviewCount ? ` across ${f.reviewCount} reviews` : ""}`);
  if (f.socialProfiles.length) strengths.push(`Active social presence (${f.socialProfiles.join(", ")})`);
  const weaknesses = f.website.status === "no_website" ? ["No official website found"] : f.website.issues.slice(0, 4);
  const where = [f.location.city, f.location.country].filter(Boolean).join(", ");
  return {
    summary: `${f.businessName} is a ${f.category} in ${where}.${f.rating ? ` It holds a ${f.rating.toFixed(1)}-star rating${f.reviewCount ? ` from ${f.reviewCount} reviews` : ""}.` : ""}`,
    websiteOpportunity:
      f.website.status === "no_website"
        ? "No official website was found, so customers searching online rely on third-party listings. A simple, mobile-first site would give the business its own presence."
        : `The current website scored ${f.website.overallScore ?? "low"}/100 in our automated check. A modern, mobile-first redesign could address: ${f.website.issues.slice(0, 3).join("; ") || "general usability"}.`,
    strengths,
    weaknesses,
    recommendedFeatures: ["Mobile-first responsive layout", "Click-to-call and directions", ...(key === "restaurant" || key === "hotel" || key === "salon" ? ["Online booking"] : []), "Google-friendly SEO basics"],
    recommendedSections: DEFAULT_SECTIONS[key],
    tone: "warm and professional",
    primaryCTA: key === "restaurant" ? "Reserve a table" : key === "hotel" ? "Check availability" : key === "salon" || key === "dentist" ? "Book an appointment" : "Get in touch",
    secondaryCTA: "Get directions",
    targetAudience: `Local customers and visitors in ${where}`,
    services: [],
    serviceArea: f.location.city ? `${f.location.city} area` : null,
    opportunities: [
      ...(f.website.status === "no_website" ? ["No website found — customers only see directory and map listings"] : []),
      ...(f.website.mobileFriendly === false ? ["Current website is not mobile-friendly"] : []),
      ...(f.website.hasContactForm === false ? ["No contact or quote form on the current website"] : []),
      ...(f.website.hasClearCta === false ? ["No clear call-to-action on the current website"] : []),
      ...(!f.socialProfiles.length ? ["No social profiles found"] : []),
    ],
    packageFeatures: [...CORE_PACKAGE_FEATURES, "Click-to-call button", "Contact / request-a-quote form", "Google Maps location", "Services section", ...(f.rating && f.reviewCount ? (["Reviews / testimonials"] as const) : [])],
    confidence: f.rating && f.reviewCount ? 0.6 : 0.4,
  };
});
