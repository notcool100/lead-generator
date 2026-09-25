/**
 * Seed data: admin user, templates, default settings, sample campaigns and 30
 * sample leads across several website statuses, with analyses, previews and
 * one outreach draft. All sample contacts use reserved `.example` domains so
 * they can never receive real email. Safe to re-run (sample data is replaced).
 */
import "dotenv/config";
import { prisma, type WebsiteStatus, type LeadStatus } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { normalizeAddress, normalizeBusinessName } from "@/lib/normalize";
import { setAIProviderForTests } from "@/providers/ai";
import { MockAIProvider } from "@/providers/ai/MockAIProvider";
import { analyzeBusiness } from "@/services/ai-analysis/BusinessAnalyzer";
import { saveSettings, getSettings } from "@/services/compliance/settings";
import { deployPreview } from "@/services/deployment/PreviewDeploymentService";
import { generateOutreachDraft } from "@/services/outreach/OutreachGenerator";
import { ensureTemplatesSeeded, generatePreview } from "@/services/preview-generation/previewService";
import { scoreLead } from "@/services/scoring/leadScore";

const SAMPLE_PREFIX = "[Sample] ";

type Sample = {
  name: string;
  category: string;
  city: string;
  country: string;
  website: WebsiteStatus;
  rating: number;
  reviews: number;
  email: boolean;
};

const S = (name: string, category: string, city: string, country: string, website: WebsiteStatus, rating: number, reviews: number, email = true): Sample => ({
  name, category, city, country, website, rating, reviews, email,
});

const SAMPLES: Sample[] = [
  // 10 restaurants
  S("Tasca do Rio", "restaurant", "Lisbon", "Portugal", "no_website", 4.6, 412),
  S("O Cantinho Azul", "restaurant", "Lisbon", "Portugal", "poor_website", 4.4, 188),
  S("Casa Alfama", "restaurant", "Lisbon", "Portugal", "outdated", 4.2, 96),
  S("Mar e Brasa", "restaurant", "Lisbon", "Portugal", "good_website", 4.7, 1020),
  S("Pátio das Oliveiras", "restaurant", "Lisbon", "Portugal", "no_website", 4.5, 73, false),
  S("Trattoria Sole", "restaurant", "Porto", "Portugal", "outdated", 4.3, 240),
  S("Bistro Ribeira", "restaurant", "Porto", "Portugal", "no_website", 4.8, 57),
  S("La Brasa Norte", "restaurant", "Valencia", "Spain", "poor_website", 4.1, 132),
  S("El Rincón de Ana", "restaurant", "Valencia", "Spain", "no_website", 4.6, 305),
  S("Mesón del Puerto", "restaurant", "Valencia", "Spain", "unreachable", 3.9, 64),
  // 5 cafes
  S("Grão Café", "cafe", "Lisbon", "Portugal", "no_website", 4.7, 221),
  S("Leitaria Central", "cafe", "Porto", "Portugal", "outdated", 4.4, 142),
  S("Café Horta", "cafe", "Lisbon", "Portugal", "good_website", 4.5, 380),
  S("Morning Ritual Coffee", "cafe", "Valencia", "Spain", "poor_website", 4.3, 88),
  S("Pastelaria Aurora", "cafe", "Porto", "Portugal", "no_website", 4.6, 510),
  // 5 hotels
  S("Casa do Largo Guesthouse", "hotel", "Lisbon", "Portugal", "outdated", 4.5, 640),
  S("Hotel Miradouro", "hotel", "Lisbon", "Portugal", "good_website", 4.2, 1230),
  S("Quinta das Vinhas B&B", "hotel", "Porto", "Portugal", "poor_website", 4.8, 175),
  S("Hostal La Plaza", "hotel", "Valencia", "Spain", "no_website", 4.0, 212),
  S("Boutique Rua Nova", "hotel", "Porto", "Portugal", "outdated", 4.6, 330),
  // 5 salons
  S("Studio Lume Hair", "salon", "Lisbon", "Portugal", "no_website", 4.9, 96),
  S("Barbearia Clássica", "salon", "Porto", "Portugal", "poor_website", 4.7, 260),
  S("Bella Nails & Beauty", "salon", "Valencia", "Spain", "no_website", 4.5, 44),
  S("Atelier Cabelo", "salon", "Lisbon", "Portugal", "good_website", 4.6, 150),
  S("Salón Marina", "salon", "Valencia", "Spain", "outdated", 4.2, 71),
  // 5 gyms
  S("Forte Fitness Club", "gym", "Lisbon", "Portugal", "outdated", 4.3, 420),
  S("Box 21 CrossFit", "gym", "Porto", "Portugal", "no_website", 4.8, 133),
  S("Yoga Casa Luz", "gym", "Lisbon", "Portugal", "poor_website", 4.9, 64),
  S("Iron Valley Gym", "gym", "Valencia", "Spain", "good_website", 4.1, 390),
  S("Studio Pilates Mar", "gym", "Valencia", "Spain", "no_website", 4.7, 58, false),
];

const REASONS: Record<WebsiteStatus, string[]> = {
  no_website: ["No website listed by the data source; no matching domain found"],
  poor_website: ["No mobile viewport — likely not mobile-friendly", "Site is not served over HTTPS", "No clear call-to-action", "Table-based layout"],
  outdated: ["No mobile viewport — likely not mobile-friendly", "Copyright notice last updated 2017", "Missing meta description"],
  good_website: ["Missing meta description"],
  excellent_website: [],
  unreachable: ["Website could not be reached: ECONNREFUSED"],
  unknown: [],
};
const SCORES: Partial<Record<WebsiteStatus, [number, number, number, number]>> = {
  poor_website: [45, 30, 35, 37],
  outdated: [55, 60, 55, 57],
  good_website: [95, 75, 80, 83],
};

function slug(s: string) {
  return normalizeBusinessName(s).replace(/\s+/g, "");
}

async function main() {
  setAIProviderForTests(new MockAIProvider());

  // Admin user (password only set on first creation)
  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 10)) {
    throw new Error("Set ADMIN_PASSWORD (min 10 chars) for production seeding");
  }
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "change-me-now";
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Admin", role: "admin", passwordHash: await hashPassword(password) },
    update: {},
  });
  console.log(`✓ admin user: ${email}`);

  await ensureTemplatesSeeded();
  console.log("✓ 9 website templates");

  // Production: admin + templates only; never touch existing settings or data.
  if (process.env.SEED_SAMPLE_DATA === "false") {
    const existing = await prisma.setting.findUnique({ where: { key: "compliance" } });
    if (!existing) {
      const from = process.env.EMAIL_FROM?.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
      await saveSettings("compliance", { ...(await getSettings("compliance")), ...(from ? { senderName: from[1].trim(), senderEmail: from[2].trim() } : {}), replyTo: process.env.EMAIL_REPLY_TO ?? "" });
      console.log("✓ default compliance settings");
    }
    console.log("Done (SEED_SAMPLE_DATA=false — no sample data).");
    return;
  }

  await saveSettings("compliance", { ...(await getSettings("compliance")), senderName: "Alex from Studio North", businessName: "Studio North Web Design", businessAddress: "Rua Exemplo 1, 1000-001 Lisboa, Portugal" });
  await saveSettings("general", await getSettings("general"));
  console.log("✓ default settings");

  // Replace previous sample data
  const old = await prisma.campaign.findMany({ where: { name: { startsWith: SAMPLE_PREFIX } }, select: { id: true } });
  await prisma.lead.deleteMany({ where: { campaignId: { in: old.map((c) => c.id) } } });
  await prisma.campaign.deleteMany({ where: { id: { in: old.map((c) => c.id) } } });

  const campaignDefs = [
    { key: "Lisbon", name: "Lisbon hospitality", category: "restaurant", city: "Lisbon", country: "Portugal" },
    { key: "Porto", name: "Porto independents", category: "cafe", city: "Porto", country: "Portugal" },
    { key: "Valencia", name: "Valencia local businesses", category: "restaurant", city: "Valencia", country: "Spain" },
  ];
  const campaigns: Record<string, string> = {};
  for (const c of campaignDefs) {
    const created = await prisma.campaign.create({
      data: {
        name: SAMPLE_PREFIX + c.name, category: c.category, city: c.city, country: c.country, status: c.key === "Valencia" ? "paused" : "running",
        maxLeads: 50, dailyEmailLimit: 20, autoGeneratePreview: false, autoGenerateDrafts: false, createdById: admin.id, startedAt: new Date(),
      },
    });
    campaigns[c.key] = created.id;
  }
  console.log(`✓ ${campaignDefs.length} sample campaigns`);

  const qualifying: WebsiteStatus[] = ["no_website", "poor_website", "outdated"];
  const created: { id: string; sample: Sample }[] = [];
  for (const [i, s] of SAMPLES.entries()) {
    const address = `Rua Exemplo ${10 + i}`;
    const emailAddr = s.email ? `hello@${slug(s.name)}.example` : null;
    const websiteUrl = s.website === "no_website" ? null : `https://www.${slug(s.name)}.example`;
    const { score } = scoreLead({ websiteStatus: s.website, email: emailAddr, phone: "+351 210 000 000", rating: s.rating, reviewCount: s.reviews, address, hasSocial: i % 2 === 0 });
    const status: LeadStatus = qualifying.includes(s.website) && score >= 50 ? "qualified" : "rejected";
    const lead = await prisma.lead.create({
      data: {
        campaignId: campaigns[s.city] ?? campaigns.Lisbon,
        businessName: s.name,
        normalizedName: normalizeBusinessName(s.name),
        category: s.category,
        address,
        normalizedAddress: normalizeAddress(address),
        city: s.city,
        country: s.country,
        phone: `+${s.country === "Spain" ? "34 960" : "351 210"} ${String(100000 + i * 7919).slice(0, 6)}`,
        email: emailAddr,
        websiteUrl,
        domain: websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "") : null,
        source: "seed",
        sourceExternalId: `seed_${i}`,
        rating: s.rating,
        reviewCount: s.reviews,
        socialLinks: i % 2 === 0 ? { instagram: `https://instagram.com/${slug(s.name)}` } : undefined,
        websiteStatus: s.website,
        websiteStatusReasons: REASONS[s.website],
        leadScore: score,
        status,
      },
    });
    const sc = SCORES[s.website];
    await prisma.websiteCheck.create({
      data: {
        leadId: lead.id,
        url: websiteUrl,
        finalUrl: websiteUrl,
        reachable: Boolean(sc),
        statusCode: sc ? 200 : null,
        responseTime: sc ? 400 + i * 37 : null,
        sslValid: sc ? s.website !== "poor_website" : null,
        mobileFriendly: sc ? s.website === "good_website" : null,
        hasContactInformation: sc ? true : null,
        hasMenu: sc ? s.category === "restaurant" || s.category === "cafe" : null,
        hasBooking: sc ? s.website === "good_website" : null,
        hasSocialLinks: sc ? i % 2 === 0 : null,
        hasClearCta: sc ? s.website === "good_website" : null,
        technicalScore: sc?.[0], contentScore: sc?.[1], designScore: sc?.[2], overallScore: sc?.[3],
        websiteStatus: s.website,
        reasons: REASONS[s.website],
        metadata: { seeded: true },
      },
    });
    await prisma.leadEvent.create({ data: { leadId: lead.id, type: "discovered", message: "Imported from seed data" } });
    await prisma.leadEvent.create({ data: { leadId: lead.id, type: "website_checked", message: `Website: ${s.website.replace(/_/g, " ")} — ${status}` } });
    created.push({ id: lead.id, sample: s });
  }
  console.log(`✓ ${created.length} sample leads`);

  // Analyses + previews for the first qualified lead of each category.
  const withPreview = new Set<string>();
  for (const cat of ["restaurant", "cafe", "hotel", "salon", "gym"]) {
    const pick = created.filter((c) => c.sample.category === cat && qualifying.includes(c.sample.website) && c.sample.email).slice(0, cat === "restaurant" ? 2 : 1);
    for (const p of pick) {
      await analyzeBusiness(p.id);
      const { previewId } = await generatePreview(p.id);
      await deployPreview(previewId);
      withPreview.add(p.id);
    }
  }
  console.log(`✓ ${withPreview.size} analyses + deployed sample previews`);

  const firstDraft = [...withPreview][0];
  if (firstDraft) {
    await generateOutreachDraft(firstDraft);
    console.log("✓ 1 outreach draft awaiting review");
  }

  console.log(`\nDone. Sign in at ${process.env.APP_URL ?? "http://localhost:3000"}/login as ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
