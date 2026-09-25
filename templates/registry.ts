/**
 * Reusable website templates. The AI never writes HTML — it fills a typed
 * PreviewConfig, and templates/render.ts turns that into a static page.
 */
export const TEMPLATE_KEYS = [
  "restaurant", "cafe", "hotel", "salon", "gym", "dentist", "event_venue", "real_estate", "professional_services",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const FONT_PAIRS = {
  "playfair-inter": { heading: "Playfair Display", body: "Inter" },
  "fraunces-worksans": { heading: "Fraunces", body: "Work Sans" },
  "dmserif-dmsans": { heading: "DM Serif Display", body: "DM Sans" },
  "outfit-inter": { heading: "Outfit", body: "Inter" },
  "spacegrotesk-inter": { heading: "Space Grotesk", body: "Inter" },
  "cormorant-lato": { heading: "Cormorant Garamond", body: "Lato" },
  "manrope-manrope": { heading: "Manrope", body: "Manrope" },
} as const;
export type FontPairKey = keyof typeof FONT_PAIRS;

export interface Palette {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export interface TemplateDefinition {
  key: TemplateKey;
  name: string;
  description: string;
  keywords: string[];
  defaultFontPair: FontPairKey;
  palettes: Palette[];
  offeringsTitle: string;
  offeringsPlaceholder: string[];
  /** Unsplash search terms for licensed imagery. */
  imageQuery: string;
  layout: "split" | "centered" | "fullbleed";
}

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  restaurant: {
    key: "restaurant", name: "Trattoria", description: "Warm, image-led layout with menu highlights and reservations.",
    keywords: ["restaurant", "bistro", "trattoria", "pizzeria", "grill", "diner", "eatery", "steakhouse", "sushi", "food", "bar", "pub"],
    defaultFontPair: "playfair-inter",
    palettes: [
      { primary: "#7c2d12", accent: "#d97706", background: "#fffbf5", surface: "#fdf2e3", text: "#1c1917" },
      { primary: "#14532d", accent: "#ca8a04", background: "#fafaf5", surface: "#eef2e6", text: "#1a1a1a" },
    ],
    offeringsTitle: "Menu highlights",
    offeringsPlaceholder: ["Starters", "Mains", "Desserts"],
    imageQuery: "restaurant interior dining",
    layout: "fullbleed",
  },
  cafe: {
    key: "cafe", name: "Roastery", description: "Cosy, friendly café layout with menu and opening hours.",
    keywords: ["cafe", "café", "coffee", "bakery", "tea", "patisserie", "brunch"],
    defaultFontPair: "fraunces-worksans",
    palettes: [
      { primary: "#5b3a29", accent: "#c2410c", background: "#fdf8f3", surface: "#f3e8dc", text: "#2b1d14" },
      { primary: "#334155", accent: "#b45309", background: "#f8fafc", surface: "#eef2f6", text: "#0f172a" },
    ],
    offeringsTitle: "On the menu",
    offeringsPlaceholder: ["Coffee", "Pastries", "Brunch"],
    imageQuery: "coffee shop cafe",
    layout: "split",
  },
  hotel: {
    key: "hotel", name: "Harbour Stay", description: "Elegant hospitality layout with rooms, amenities and booking CTA.",
    keywords: ["hotel", "inn", "guesthouse", "hostel", "b&b", "bed and breakfast", "resort", "lodge", "suites"],
    defaultFontPair: "cormorant-lato",
    palettes: [
      { primary: "#1e3a5f", accent: "#b08d57", background: "#fbfaf7", surface: "#f1ede4", text: "#1b1f24" },
      { primary: "#3f3f46", accent: "#a16207", background: "#fafafa", surface: "#f0efeb", text: "#18181b" },
    ],
    offeringsTitle: "Rooms & amenities",
    offeringsPlaceholder: ["Rooms", "Amenities", "Location"],
    imageQuery: "boutique hotel room",
    layout: "fullbleed",
  },
  salon: {
    key: "salon", name: "Atelier", description: "Clean, stylish layout for salons and beauty studios.",
    keywords: ["salon", "hair", "barber", "beauty", "nail", "spa", "lashes", "brows", "massage"],
    defaultFontPair: "dmserif-dmsans",
    palettes: [
      { primary: "#831843", accent: "#db2777", background: "#fffafb", surface: "#fbeff3", text: "#1f1720" },
      { primary: "#1f2937", accent: "#be8a6c", background: "#fbfaf9", surface: "#f2ede9", text: "#111827" },
    ],
    offeringsTitle: "Services",
    offeringsPlaceholder: ["Cuts & styling", "Colour", "Treatments"],
    imageQuery: "hair salon interior",
    layout: "split",
  },
  gym: {
    key: "gym", name: "Momentum", description: "Bold, high-contrast layout for gyms and fitness studios.",
    keywords: ["gym", "fitness", "crossfit", "yoga", "pilates", "boxing", "training", "martial arts", "studio"],
    defaultFontPair: "spacegrotesk-inter",
    palettes: [
      { primary: "#0f172a", accent: "#84cc16", background: "#0b0f19", surface: "#151b2b", text: "#f1f5f9" },
      { primary: "#111827", accent: "#f97316", background: "#0c0c0f", surface: "#18181f", text: "#f5f5f5" },
    ],
    offeringsTitle: "Training & memberships",
    offeringsPlaceholder: ["Classes", "Personal training", "Memberships"],
    imageQuery: "gym fitness training",
    layout: "centered",
  },
  dentist: {
    key: "dentist", name: "Clinic", description: "Calm, trustworthy layout for dental and medical practices.",
    keywords: ["dentist", "dental", "orthodont", "clinic", "doctor", "physio", "medical", "optician", "veterinar"],
    defaultFontPair: "manrope-manrope",
    palettes: [
      { primary: "#0e7490", accent: "#14b8a6", background: "#f8fdfd", surface: "#e9f6f7", text: "#0f2a33" },
      { primary: "#1d4ed8", accent: "#0ea5e9", background: "#f8fbff", surface: "#eaf2fe", text: "#0f172a" },
    ],
    offeringsTitle: "Treatments",
    offeringsPlaceholder: ["Check-ups", "Hygiene", "Cosmetic"],
    imageQuery: "modern dental clinic",
    layout: "split",
  },
  event_venue: {
    key: "event_venue", name: "Celebrate", description: "Romantic, gallery-led layout for wedding & event venues.",
    keywords: ["wedding", "venue", "event", "banquet", "hall", "party", "conference", "gardens"],
    defaultFontPair: "cormorant-lato",
    palettes: [
      { primary: "#4a3b32", accent: "#b9975b", background: "#fdfbf7", surface: "#f4eee4", text: "#2a211b" },
    ],
    offeringsTitle: "Spaces & packages",
    offeringsPlaceholder: ["Weddings", "Private events", "Corporate"],
    imageQuery: "wedding venue reception",
    layout: "fullbleed",
  },
  real_estate: {
    key: "real_estate", name: "Keystone", description: "Professional layout for estate agents and property firms.",
    keywords: ["real estate", "estate agent", "realtor", "property", "letting", "realty"],
    defaultFontPair: "outfit-inter",
    palettes: [
      { primary: "#1e293b", accent: "#0284c7", background: "#f8fafc", surface: "#eef2f7", text: "#0f172a" },
    ],
    offeringsTitle: "How we help",
    offeringsPlaceholder: ["Buying", "Selling", "Lettings"],
    imageQuery: "modern house exterior",
    layout: "split",
  },
  professional_services: {
    key: "professional_services", name: "Counsel", description: "Understated layout for accountants, lawyers and consultants.",
    keywords: ["accountant", "lawyer", "law", "solicitor", "consult", "agency", "architect", "insurance", "services"],
    defaultFontPair: "dmserif-dmsans",
    palettes: [
      { primary: "#1f2a44", accent: "#4f46e5", background: "#fafafa", surface: "#f0f1f5", text: "#111827" },
    ],
    offeringsTitle: "Services",
    offeringsPlaceholder: ["Advisory", "Compliance", "Consultation"],
    imageQuery: "modern office workspace",
    layout: "centered",
  },
};

/** Deterministic keyword match; returns null when ambiguous (then a small model classifies). */
export function matchTemplateByKeyword(category: string): TemplateKey | null {
  const c = category.toLowerCase();
  let best: { key: TemplateKey; len: number } | null = null;
  for (const t of Object.values(TEMPLATES)) {
    for (const k of t.keywords) {
      if (c.includes(k) && (!best || k.length > best.len)) best = { key: t.key, len: k.length };
    }
  }
  return best?.key ?? null;
}
