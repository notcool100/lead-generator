import { prisma, type Prisma } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import {
  BUSINESS_ANALYSIS_SYSTEM,
  BusinessAnalysisSchema,
  businessAnalysisPrompt,
  type BusinessFacts,
} from "@/prompts/business-analysis";
import type { NextAction } from "@/queue/queues";
import { generateJsonCached } from "./aiClient";

export async function buildBusinessFacts(leadId: string): Promise<BusinessFacts> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { websiteChecks: { orderBy: { checkedAt: "desc" }, take: 1 } },
  });
  const check = lead.websiteChecks[0];
  const meta = (check?.metadata ?? {}) as { title?: string | null; metaDescription?: string | null; hasContactForm?: boolean | null; mentionsServiceArea?: boolean | null };
  return {
    businessName: lead.businessName,
    category: lead.category,
    location: { city: lead.city, region: lead.region, country: lead.country, address: lead.address },
    description: lead.description,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    phonePresent: Boolean(lead.phone),
    emailPresent: Boolean(lead.email),
    socialProfiles: Object.keys((lead.socialLinks as Record<string, string> | null) ?? {}),
    website: {
      status: lead.websiteStatus,
      url: lead.websiteUrl,
      overallScore: check?.overallScore ?? null,
      issues: lead.websiteStatusReasons,
      hasBooking: check?.hasBooking ?? null,
      hasMenu: check?.hasMenu ?? null,
      mobileFriendly: check?.mobileFriendly ?? null,
      hasClearCta: check?.hasClearCta ?? null,
      hasContactForm: meta.hasContactForm ?? null,
      mentionsServiceArea: meta.mentionsServiceArea ?? null,
      pageTitle: meta.title ?? null,
      metaDescription: meta.metaDescription ?? null,
    },
  };
}

/** Runs Claude business analysis for a qualified lead and stores the validated result. */
export async function analyzeBusiness(leadId: string, opts: { force?: boolean } = {}): Promise<{ next: NextAction[] }> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
  if (lead.doNotContact) return { next: [] };

  await prisma.lead.update({ where: { id: leadId }, data: { status: "analyzing" } });
  const facts = await buildBusinessFacts(leadId);

  try {
    const res = await generateJsonCached(
      { system: BUSINESS_ANALYSIS_SYSTEM, prompt: businessAnalysisPrompt(facts), schema: BusinessAnalysisSchema, schemaName: "business_analysis", tier: "large", maxTokens: 4000 },
      { bypassCache: opts.force },
    );
    const a = res.data;
    await prisma.leadAnalysis.create({
      data: {
        leadId,
        aiProvider: res.provider,
        model: res.model,
        summary: a.summary,
        strengths: a.strengths,
        weaknesses: a.weaknesses,
        websiteOpportunity: a.websiteOpportunity,
        recommendedFeatures: a.recommendedFeatures,
        recommendedSections: a.recommendedSections,
        tone: a.tone,
        targetAudience: a.targetAudience,
        suggestedCtas: [a.primaryCTA, a.secondaryCTA].filter(Boolean) as string[],
        services: a.services,
        serviceArea: a.serviceArea,
        opportunities: a.opportunities,
        packageFeatures: a.packageFeatures,
        confidence: a.confidence,
        inputHash: res.cacheKey,
        rawResponse: res.raw as Prisma.InputJsonValue,
      },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: "analyzed" } });
    await leadEvent(leadId, "analyzed", `AI analysis completed (${res.model}${res.cached ? ", cached" : ""})`);
  } catch (err) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "qualified" } });
    throw err;
  }

  const auto = lead.campaign?.autoGeneratePreview ?? false;
  return { next: auto ? [{ queue: "preview-generation", payload: { leadId } }] : [] };
}
