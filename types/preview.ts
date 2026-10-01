import { z } from "zod";
import { FONT_PAIRS, TEMPLATE_KEYS } from "@/templates/registry";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ImageRefSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200),
  source: z.string().max(60),
  license: z.string().max(120),
  attribution: z.string().max(200).nullable(),
  attributionUrl: z.string().url().nullable(),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

/** The JSON contract between AI/content generation and the templates. */
export const PreviewConfigSchema = z.object({
  templateKey: z.enum(TEMPLATE_KEYS),
  businessName: z.string().min(1).max(160),
  /** The lead's business category (e.g. "roofing contractor"). Optional for configs stored before it existed. */
  category: z.string().max(120).optional(),
  headline: z.string().min(1).max(140),
  subheadline: z.string().max(300),
  primaryCTA: z.object({ label: z.string().max(40), href: z.string().max(300) }),
  secondaryCTA: z.object({ label: z.string().max(40), href: z.string().max(300) }).nullable(),
  sections: z.array(z.string().max(40)).max(12),
  colors: z.object({ primary: hex, accent: hex, background: hex, surface: hex, text: hex }),
  fontPair: z.enum(Object.keys(FONT_PAIRS) as [keyof typeof FONT_PAIRS, ...(keyof typeof FONT_PAIRS)[]]),
  content: z.object({
    about: z.string().max(1200).nullable(),
    offeringsTitle: z.string().max(60),
    /** Real offerings — only when present in source data. */
    offerings: z.array(z.object({ title: z.string().max(80), description: z.string().max(300) })).max(9),
    /** Placeholder labels shown (clearly marked) when offerings are unknown. */
    offeringsPlaceholder: z.array(z.string().max(60)).max(6),
    highlights: z.array(z.string().max(120)).max(4),
    rating: z.object({ value: z.number(), count: z.number().int(), source: z.string() }).nullable(),
    contact: z.object({
      phone: z.string().max(40).nullable(),
      email: z.string().max(200).nullable(),
      address: z.string().max(300).nullable(),
      city: z.string().max(120).nullable(),
      country: z.string().max(120).nullable(),
      mapQuery: z.string().max(300).nullable(),
    }),
    social: z.record(z.string(), z.string().url()),
  }),
  /** Lead-generation features chosen for this business (from the analysis' package features). */
  features: z
    .object({
      quoteForm: z.boolean(),
      freeEstimate: z.boolean(),
      serviceArea: z.string().max(200).nullable(),
    })
    .default({ quoteForm: false, freeEstimate: false, serviceArea: null }),
  images: z.object({ hero: ImageRefSchema.nullable(), gallery: z.array(ImageRefSchema).max(12) }),
  seo: z.object({ title: z.string().max(70), description: z.string().max(170) }),
  generatedAt: z.string(),
});
export type PreviewConfig = z.infer<typeof PreviewConfigSchema>;
