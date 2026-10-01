import { z } from "zod";
import { registerMockHandler } from "@/providers/ai/MockAIProvider";
import { FONT_PAIRS, TEMPLATE_KEYS, type TemplateKey } from "@/templates/registry";
import { factsBlock, NO_FABRICATION_RULES, readFacts } from "./shared";

/** What the model writes. Structural/factual fields (contact, rating, images) are filled by code. */
export const WebsiteCopySchema = z.object({
  headline: z.string().min(1).max(140),
  subheadline: z.string().max(300),
  about: z.string().max(1200).nullable(),
  primaryCTALabel: z.string().max(40),
  secondaryCTALabel: z.string().max(40).nullable(),
  highlights: z.array(z.string().max(120)).max(4),
  sections: z.array(z.string().max(40)).max(12),
  paletteIndex: z.number().int().min(0).max(3),
  fontPair: z.enum(Object.keys(FONT_PAIRS) as [keyof typeof FONT_PAIRS, ...(keyof typeof FONT_PAIRS)[]]),
  seoTitle: z.string().max(70),
  seoDescription: z.string().max(170),
});
export type WebsiteCopy = z.infer<typeof WebsiteCopySchema>;

export const TemplateClassificationSchema = z.object({ templateKey: z.enum(TEMPLATE_KEYS) });

export const TEMPLATE_CLASSIFY_SYSTEM = `Classify a local business category into exactly one website template key.
Allowed keys: ${TEMPLATE_KEYS.join(", ")}. Choose professional_services when nothing else fits.`;

export interface WebsiteCopyFacts {
  businessName: string;
  category: string;
  templateKey: TemplateKey;
  city: string | null;
  country: string;
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  analysis: {
    summary: string;
    tone: string | null;
    primaryCTA: string | null;
    secondaryCTA: string | null;
    targetAudience: string | null;
    recommendedSections: string[];
  } | null;
  paletteCount: number;
}

export const WEBSITE_COPY_SYSTEM = `You write website copy for a concept homepage that a web agency will show to a local business owner.
The copy fills a fixed template; you do not write HTML or code.

${NO_FABRICATION_RULES}
- Headline and subheadline should be inviting but generic enough to be true (e.g. "Neighbourhood Italian cooking in Lisbon"), grounded in category and location.
- "about" must only restate provided facts (category, location, rating, description). Return null if there is too little to say truthfully.
- highlights: up to 4 short factual points (e.g. "4.7★ from 230 reviews", "In the heart of Porto"). Empty array if none.
- Never mention prices, specific dishes/services, years in business or awards unless present in facts.
- paletteIndex must be less than paletteCount.
- When templateKey is "construction" the headline is set in huge uppercase type: keep it to a bold statement of at most 5 words (e.g. "Built right in Perth").`;

export function websiteCopyPrompt(facts: WebsiteCopyFacts) {
  return `Write the homepage copy JSON for this business.\n\n${factsBlock(facts)}`;
}

registerMockHandler("website_copy", (prompt) => {
  const f = readFacts<WebsiteCopyFacts>(prompt);
  const where = [f.city, f.country].filter(Boolean).join(", ");
  const highlights: string[] = [];
  if (f.rating && f.reviewCount) highlights.push(`${f.rating.toFixed(1)}★ from ${f.reviewCount} reviews`);
  if (f.city) highlights.push(`Located in ${f.city}`);
  return {
    headline: f.businessName,
    subheadline: `${capitalize(f.category)} in ${where}`,
    about: f.description ?? (f.rating && f.reviewCount ? `${f.businessName} is a ${f.category} in ${where}, rated ${f.rating.toFixed(1)} stars by ${f.reviewCount} reviewers.` : null),
    primaryCTALabel: f.analysis?.primaryCTA ?? "Get in touch",
    secondaryCTALabel: f.analysis?.secondaryCTA ?? "Find us",
    highlights,
    sections: f.analysis?.recommendedSections ?? [],
    paletteIndex: 0,
    fontPair: "playfair-inter",
    seoTitle: `${f.businessName} — ${capitalize(f.category)} in ${f.city ?? f.country}`.slice(0, 70),
    seoDescription: `${f.businessName}, ${f.category} in ${where}.`.slice(0, 170),
  };
});

registerMockHandler("template_classification", () => ({ templateKey: "professional_services" }));

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
