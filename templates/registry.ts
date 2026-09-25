/**
 * Reusable website templates. The AI never writes HTML: it fills a typed
 * PreviewConfig, and templates/render.ts turns that into a static page.
 */
export const TEMPLATE_KEYS = [
  "restaurant", "cafe", "hotel", "salon", "gym", "dentist", "event_venue", "real_estate", "professional_services",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/**
 * Font pairs the AI may choose from. Keys are stable (stored in preview configs);
 * the renderer uses each template's own pair so every category keeps its identity.
 */
export const FONT_PAIRS = {
  "playfair-inter": { heading: "Playfair Display", body: "Manrope" },
  "fraunces-worksans": { heading: "Bricolage Grotesque", body: "DM Sans" },
  "dmserif-dmsans": { heading: "DM Serif Display", body: "DM Sans" },
  "outfit-inter": { heading: "Outfit", body: "Manrope" },
  "spacegrotesk-inter": { heading: "Space Grotesk", body: "Manrope" },
  "cormorant-lato": { heading: "Cormorant Garamond", body: "Manrope" },
  "manrope-manrope": { heading: "Manrope", body: "Manrope" },
} as const;
export type FontPairKey = keyof typeof FONT_PAIRS;

export interface Palette {
  /** Deep brand tone: footer, bands, dark surfaces. */
  primary: string;
  /** The single accent used for CTAs and highlights. */
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export interface ImageQueries {
  hero: string;
  ambience: string;
  detail: string;
  people: string;
}

export interface TemplateDefinition {
  key: TemplateKey;
  name: string;
  description: string;
  keywords: string[];
  defaultFontPair: FontPairKey;
  /** Heading weight / style tuned to the typeface. */
  headingWeight: 500 | 600 | 700;
  palettes: Palette[];
  offeringsTitle: string;
  offeringsPlaceholder: string[];
  /** Search terms for licensed stock photography, one per page role. */
  imageQueries: ImageQueries;
  /** Kept for backwards compatibility (single query). */
  imageQuery: string;
  layout: "split" | "fullbleed";
  /** Invitation line for the parallax band. Never a factual claim about the business. */
  statement: string;
  /** Final call-to-action headline (invitation, not a claim). */
  closing: string;
  galleryTitle: string;
  aboutTitle: string;
}

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  restaurant: {
    key: "restaurant", name: "Trattoria", description: "Full-bleed, photo-led layout with menu highlights, gallery and reservations.",
    keywords: ["restaurant", "bistro", "trattoria", "pizzeria", "grill", "diner", "eatery", "steakhouse", "sushi", "food", "bar", "pub", "momo", "thakali"],
    defaultFontPair: "playfair-inter", headingWeight: 600,
    // Olive + Brick + Paper
    palettes: [
      { primary: "#23291f", accent: "#b23a2b", background: "#f4f3ee", surface: "#e9e8df", text: "#1d201b" },
      { primary: "#1f2a24", accent: "#c0532e", background: "#f3f4f1", surface: "#e6e9e3", text: "#18201b" },
    ],
    offeringsTitle: "From the kitchen",
    offeringsPlaceholder: ["Starters", "Mains", "Desserts"],
    imageQueries: { hero: "restaurant dining room evening", ambience: "restaurant table setting", detail: "plated food dish", people: "chef cooking kitchen" },
    imageQuery: "restaurant interior dining",
    layout: "fullbleed",
    statement: "Come hungry. Stay a while.",
    closing: "Save your table",
    galleryTitle: "Inside the restaurant",
    aboutTitle: "Our table is yours",
  },
  cafe: {
    key: "cafe", name: "Roastery", description: "Split hero with photo collage, menu, and a cosy neighbourhood feel.",
    keywords: ["cafe", "café", "coffee", "bakery", "tea", "patisserie", "brunch"],
    defaultFontPair: "fraunces-worksans", headingWeight: 700,
    // Black and Tan
    palettes: [
      { primary: "#1b1a18", accent: "#c07a45", background: "#f5f5f3", surface: "#ebe9e6", text: "#1b1a18" },
      { primary: "#20242b", accent: "#d0703c", background: "#f4f5f6", surface: "#e8eaed", text: "#1a1d22" },
    ],
    offeringsTitle: "On the counter",
    offeringsPlaceholder: ["Coffee", "Pastries", "Brunch"],
    imageQueries: { hero: "cozy coffee shop interior", ambience: "cafe window seat", detail: "latte art coffee cup", people: "barista making coffee" },
    imageQuery: "coffee shop cafe",
    layout: "split",
    statement: "Pull up a chair. The coffee is on.",
    closing: "Drop by for a cup",
    galleryTitle: "A look around",
    aboutTitle: "Your neighbourhood café",
  },
  hotel: {
    key: "hotel", name: "Harbour Stay", description: "Elegant full-bleed hospitality layout with rooms, gallery and booking.",
    keywords: ["hotel", "inn", "guesthouse", "guest house", "hostel", "b&b", "bed and breakfast", "resort", "lodge", "suites", "homestay"],
    defaultFontPair: "cormorant-lato", headingWeight: 600,
    // Cobalt + Cream (cool)
    palettes: [
      { primary: "#14213d", accent: "#2548b8", background: "#f6f6f3", surface: "#e9eaee", text: "#141b2b" },
      { primary: "#1b2433", accent: "#3a5bd9", background: "#f5f6f8", surface: "#e7eaf0", text: "#161c28" },
    ],
    offeringsTitle: "Rooms & stay",
    offeringsPlaceholder: ["Rooms", "Amenities", "Location"],
    imageQueries: { hero: "boutique hotel exterior view", ambience: "hotel room interior bed", detail: "hotel lobby details", people: "hotel breakfast terrace" },
    imageQuery: "boutique hotel room",
    layout: "fullbleed",
    statement: "Rest easy. We will leave the light on.",
    closing: "Plan your stay",
    galleryTitle: "Around the property",
    aboutTitle: "A place to land",
  },
  salon: {
    key: "salon", name: "Atelier", description: "Stylish split layout for salons, barbers and beauty studios.",
    keywords: ["salon", "hair", "barber", "beauty", "nail", "spa", "lashes", "brows", "massage", "parlour", "parlor"],
    defaultFontPair: "dmserif-dmsans", headingWeight: 500,
    // Terracotta + Slate
    palettes: [
      { primary: "#1e2530", accent: "#c4583a", background: "#f3f4f6", surface: "#e6e8ec", text: "#1b212b" },
      { primary: "#262230", accent: "#b54a5e", background: "#f5f4f6", surface: "#e9e6ec", text: "#1f1b27" },
    ],
    offeringsTitle: "Services",
    offeringsPlaceholder: ["Cuts & styling", "Colour", "Treatments"],
    imageQueries: { hero: "hair salon interior modern", ambience: "salon chair mirror", detail: "hair styling tools", people: "hairdresser styling hair" },
    imageQuery: "hair salon interior",
    layout: "split",
    statement: "Sit back. We have got you.",
    closing: "Book your chair",
    galleryTitle: "The studio",
    aboutTitle: "Made for you",
  },
  gym: {
    key: "gym", name: "Momentum", description: "Bold, high-contrast dark layout for gyms and fitness studios.",
    keywords: ["gym", "fitness", "crossfit", "yoga", "pilates", "boxing", "training", "martial arts", "studio"],
    defaultFontPair: "spacegrotesk-inter", headingWeight: 700,
    // Monochrome + electric lime (dark by design)
    palettes: [
      { primary: "#0d0e10", accent: "#c6f432", background: "#0e0f11", surface: "#17191d", text: "#eef0f3" },
      { primary: "#0f0f12", accent: "#ff6a3d", background: "#101114", surface: "#1a1b20", text: "#f1f1f3" },
    ],
    offeringsTitle: "Train with us",
    offeringsPlaceholder: ["Classes", "Personal training", "Memberships"],
    imageQueries: { hero: "gym training weights dark", ambience: "fitness studio interior", detail: "kettlebell dumbbells gym", people: "group fitness class" },
    imageQuery: "gym fitness training",
    layout: "split",
    statement: "Show up. The rest follows.",
    closing: "Start training",
    galleryTitle: "The floor",
    aboutTitle: "Built for every level",
  },
  dentist: {
    key: "dentist", name: "Clinic", description: "Calm, trustworthy layout for dental and medical practices.",
    keywords: ["dentist", "dental", "orthodont", "clinic", "doctor", "physio", "medical", "optician", "veterinar"],
    defaultFontPair: "manrope-manrope", headingWeight: 700,
    // Pure mono + teal pop
    palettes: [
      { primary: "#10262b", accent: "#0f8b8d", background: "#f7f9f9", surface: "#e8eff0", text: "#10262b" },
      { primary: "#121e33", accent: "#2563eb", background: "#f7f8fb", surface: "#e8ecf4", text: "#111a2c" },
    ],
    offeringsTitle: "Treatments",
    offeringsPlaceholder: ["Check-ups", "Hygiene", "Cosmetic"],
    imageQueries: { hero: "modern dental clinic interior", ambience: "clinic waiting room bright", detail: "dental equipment clean", people: "dentist with patient smiling" },
    imageQuery: "modern dental clinic",
    layout: "split",
    statement: "Gentle care, clear answers.",
    closing: "Book a visit",
    galleryTitle: "The practice",
    aboutTitle: "Care you can count on",
  },
  event_venue: {
    key: "event_venue", name: "Celebrate", description: "Romantic, gallery-led full-bleed layout for wedding and event venues.",
    keywords: ["wedding", "venue", "event", "banquet", "hall", "party", "conference", "gardens", "party palace"],
    defaultFontPair: "cormorant-lato", headingWeight: 600,
    // Forest + amber
    palettes: [
      { primary: "#1c2a22", accent: "#b9872f", background: "#f3f5f0", surface: "#e5eae2", text: "#1a241e" },
    ],
    offeringsTitle: "Spaces & occasions",
    offeringsPlaceholder: ["Weddings", "Private events", "Corporate"],
    imageQueries: { hero: "wedding reception venue lights", ambience: "banquet hall decorated", detail: "wedding table decoration flowers", people: "people celebrating event" },
    imageQuery: "wedding venue reception",
    layout: "fullbleed",
    statement: "Your day, your way.",
    closing: "Check your date",
    galleryTitle: "Moments here",
    aboutTitle: "Room to celebrate",
  },
  real_estate: {
    key: "real_estate", name: "Keystone", description: "Clean, confident split layout for estate agents and property firms.",
    keywords: ["real estate", "estate agent", "realtor", "property", "letting", "realty", "housing"],
    defaultFontPair: "outfit-inter", headingWeight: 600,
    // Cold luxury + electric blue
    palettes: [
      { primary: "#111418", accent: "#3b6ef5", background: "#f4f5f7", surface: "#e7e9ed", text: "#111418" },
    ],
    offeringsTitle: "How we help",
    offeringsPlaceholder: ["Buying", "Selling", "Renting"],
    imageQueries: { hero: "modern house exterior architecture", ambience: "bright living room interior", detail: "house keys new home", people: "family moving into home" },
    imageQuery: "modern house exterior",
    layout: "split",
    statement: "Find the place that fits.",
    closing: "Talk to an agent",
    galleryTitle: "Homes & spaces",
    aboutTitle: "Local know-how",
  },
  professional_services: {
    key: "professional_services", name: "Counsel", description: "Understated split layout for accountants, lawyers and consultants.",
    keywords: ["accountant", "lawyer", "law", "solicitor", "consult", "agency", "architect", "insurance", "services"],
    defaultFontPair: "outfit-inter", headingWeight: 600,
    // Monochrome + emerald
    palettes: [
      { primary: "#121412", accent: "#0f7a55", background: "#f6f6f4", surface: "#e8e9e5", text: "#141614" },
    ],
    offeringsTitle: "Services",
    offeringsPlaceholder: ["Advisory", "Compliance", "Consultation"],
    imageQueries: { hero: "modern office workspace light", ambience: "meeting room table", detail: "desk notebook laptop", people: "team meeting office" },
    imageQuery: "modern office workspace",
    layout: "split",
    statement: "Straight answers, done properly.",
    closing: "Book a consultation",
    galleryTitle: "The office",
    aboutTitle: "Who we are",
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
