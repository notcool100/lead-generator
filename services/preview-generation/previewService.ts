import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { WEBSITE_COPY_SYSTEM, WebsiteCopySchema, websiteCopyPrompt } from "@/prompts/website-content";
import type { NextAction } from "@/queue/queues";
import { generateJsonCached } from "@/services/ai-analysis/aiClient";
import { TEMPLATES, type TemplateKey } from "@/templates/registry";
import { PreviewConfigSchema, type PreviewConfig } from "@/types/preview";
import { findPreviewImages } from "./images";
import { selectTemplate } from "./templateSelector";
import { env } from "@/lib/env";

async function uniqueSlug(name: string, city: string | null) {
  const base = slugify(name) || "business";
  for (const candidate of [base, city ? `${base}-${slugify(city, 20)}` : null]) {
    if (candidate && !(await prisma.websitePreview.findUnique({ where: { subdomain: candidate } }))) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export async function ensureTemplatesSeeded() {
  for (const t of Object.values(TEMPLATES)) {
    await prisma.websiteTemplate.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        category: t.key,
        description: t.description,
        repositoryPath: `templates/render.ts#${t.key}`,
        configurationSchema: { $ref: "types/preview.ts#PreviewConfigSchema", layout: t.layout, palettes: t.palettes.length } as Prisma.InputJsonValue,
      },
      update: { name: t.name, description: t.description },
    });
  }
}

/** Builds the template config for a lead: AI writes copy, code fills facts. */
export async function generatePreview(leadId: string, opts: { templateKey?: string } = {}): Promise<{ previewId: string; next: NextAction[] }> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 }, previews: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { status: "preview_generating" } });

  try {
    await ensureTemplatesSeeded();
    const templateKey = (opts.templateKey && opts.templateKey in TEMPLATES ? opts.templateKey : (await selectTemplate(lead.category)).key) as TemplateKey;
    const tpl = TEMPLATES[templateKey];
    const analysis = lead.analyses[0];

    const copy = await generateJsonCached({
      system: WEBSITE_COPY_SYSTEM,
      prompt: websiteCopyPrompt({
        businessName: lead.businessName,
        category: lead.category,
        templateKey,
        city: lead.city,
        country: lead.country,
        description: lead.description,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        analysis: analysis
          ? {
              summary: analysis.summary,
              tone: analysis.tone,
              primaryCTA: (analysis.suggestedCtas as string[])[0] ?? null,
              secondaryCTA: (analysis.suggestedCtas as string[])[1] ?? null,
              targetAudience: analysis.targetAudience,
              recommendedSections: (analysis.recommendedSections as string[] | null) ?? [],
            }
          : null,
        paletteCount: tpl.palettes.length,
      }),
      schema: WebsiteCopySchema,
      schemaName: "website_copy",
      tier: "large",
      maxTokens: 3000,
    });

    const images = await findPreviewImages(tpl.imageQueries, `${lead.businessName}|${lead.city ?? ""}`);
    const c = copy.data;
    const palette = tpl.palettes[Math.min(c.paletteIndex, tpl.palettes.length - 1)];
    const mapQuery = [lead.businessName, lead.address, lead.city, lead.country].filter(Boolean).join(", ");
    const primaryHref = lead.phone ? `tel:${lead.phone.replace(/[^+\d]/g, "")}` : lead.email ? `mailto:${lead.email}` : "#contact";
    const pkg = new Set((analysis?.packageFeatures as string[] | null) ?? []);
    const features = {
      quoteForm: pkg.has("Contact / request-a-quote form"),
      freeEstimate: pkg.has("Request a Free Estimate call-to-action"),
      serviceArea: pkg.has("Service-area information") ? (analysis?.serviceArea ?? null) : null,
    };
    // Services the analysis found in the business's own data; descriptions stay generic (never invented).
    // The industrial layout lists up to six services; the others show three.
    const services = ((analysis?.services as string[] | null) ?? []).filter((x) => x.trim()).slice(0, tpl.layout === "industrial" ? 6 : 3);

    const config: PreviewConfig = PreviewConfigSchema.parse({
      templateKey,
      businessName: lead.businessName,
      category: lead.category.slice(0, 120),
      headline: c.headline,
      subheadline: c.subheadline,
      primaryCTA: features.freeEstimate ? { label: "Request a Free Estimate", href: "#quote" } : { label: c.primaryCTALabel, href: primaryHref },
      secondaryCTA: c.secondaryCTALabel ? { label: c.secondaryCTALabel, href: "#contact" } : null,
      sections: c.sections,
      colors: palette,
      fontPair: c.fontPair,
      content: {
        about: c.about,
        offeringsTitle: tpl.offeringsTitle,
        offerings: services.map((title) => ({ title: title.slice(0, 80), description: `Get in touch to ask about ${title.toLowerCase()} — full details added with you before launch.` })),
        offeringsPlaceholder: tpl.offeringsPlaceholder,
        highlights: c.highlights,
        rating: lead.rating && lead.reviewCount ? { value: lead.rating, count: lead.reviewCount, source: lead.source === "mock" ? "sample data" : lead.source.replace("_", " ") } : null,
        contact: { phone: lead.phone, email: lead.email, address: lead.address, city: lead.city, country: lead.country, mapQuery },
        social: Object.fromEntries(Object.entries((lead.socialLinks as Record<string, string> | null) ?? {}).filter(([, v]) => /^https?:\/\//.test(v))),
      },
      features,
      images,
      seo: { title: c.seoTitle, description: c.seoDescription },
      generatedAt: new Date().toISOString(),
    });

    const template = await prisma.websiteTemplate.findUniqueOrThrow({ where: { key: templateKey } });
    const existing = lead.previews[0];
    const preview = existing
      ? await prisma.websitePreview.update({
          where: { id: existing.id },
          data: { templateId: template.id, generatedContent: config as Prisma.InputJsonValue, version: { increment: 1 }, deploymentStatus: "pending" },
        })
      : await prisma.websitePreview.create({
          data: {
            leadId,
            templateId: template.id,
            subdomain: await uniqueSlug(lead.businessName, lead.city),
            deploymentProvider: env().DEPLOYMENT_PROVIDER,
            generatedContent: config as Prisma.InputJsonValue,
          },
        });

    await leadEvent(leadId, "preview_generated", `Preview generated with "${template.name}" template (v${preview.version})`);
    return { previewId: preview.id, next: [{ queue: "deployment", payload: { previewId: preview.id } }] };
  } catch (err) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "analyzed" } });
    throw err;
  }
}
