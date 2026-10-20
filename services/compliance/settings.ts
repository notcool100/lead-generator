import { z } from "zod";
import { prisma } from "@/lib/db";
import { upgradeLegacyIncludes } from "@/lib/offer";

/**
 * Admin-editable, non-secret configuration. Secrets always stay in env vars.
 */
export const ComplianceSettingsSchema = z.object({
  senderName: z.string().min(1).max(120).default("Your Name"),
  senderEmail: z.string().email().or(z.literal("")).default(""),
  replyTo: z.string().email().or(z.literal("")).default(""),
  businessName: z.string().max(200).default(""),
  businessAddress: z.string().max(500).default(""),
  footerText: z
    .string()
    .max(1000)
    .default("You received this one-off message because your business is publicly listed. Reply \"no thanks\" or use the link below and we will never contact you again."),
  unsubscribeMechanism: z.enum(["link_and_header", "link_only", "reply_only"]).default("link_and_header"),
  maxEmailsPerDay: z.number().int().min(0).max(10_000).default(50),
  maxEmailsPerHour: z.number().int().min(0).max(1_000).default(10),
  maxEmailsPerDomainPerDay: z.number().int().min(1).max(100).default(2),
  maxFollowups: z.number().int().min(0).max(5).default(2),
  followupDelayDays: z.array(z.number().int().min(1).max(60)).default([4, 8]),
  minDelaySeconds: z.number().int().min(0).max(3600).default(90),
  requireApproval: z.boolean().default(true),
  targetCountries: z.array(z.string().min(2).max(64)).default([]),
});

export type ComplianceSettings = z.infer<typeof ComplianceSettingsSchema>;

export const GeneralSettingsSchema = z.object({
  domainDiscoveryEnabled: z.boolean().default(true),
  qualifyMinScore: z.number().int().min(0).max(100).default(50),
  defaultEmailTemplate: z
    .object({ subject: z.string().max(200), intro: z.string().max(2000) })
    .default({
      subject: "A website preview for {{business_name}}",
      intro: "I came across {{business_name}} while researching {{category}} businesses in {{city}}.",
    }),
});

export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

/** The recurring offer pitched in emails and calls. Changing it here changes every new draft and call. */
export const OfferSettingsSchema = z.object({
  monthlyPrice: z.number().min(1).max(100_000).default(110),
  currency: z.string().trim().min(1).max(8).default("USD"),
  /** Demo site sent to industrial / construction companies instead of a per-lead preview. */
  industrialDemoUrl: z.string().trim().url().max(300).default("https://summit.ubucknepal.com/"),
  includes: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(12)
    .default(["Complete multi-page website with all content written for you", "Hosting and SSL", "Ongoing maintenance", "Full website content and ongoing content updates", "Lead-generation and contact features"]),
});

export type OfferSettings = z.infer<typeof OfferSettingsSchema>;

/** AI cold-calling rules. Every call (manual or automatic) is checked against these. */
export const CallingSettingsSchema = z.object({
  /** Name the AI caller introduces itself with. It always also says it is an AI assistant. */
  agentName: z.string().trim().min(1).max(40).default("Alex"),
  /** IANA timezone used for calling hours, e.g. "America/New_York". */
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  startHour: z.number().int().min(0).max(23).default(10),
  endHour: z.number().int().min(1).max(24).default(17),
  /** 0 = Sunday … 6 = Saturday */
  days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  maxCallsPerDay: z.number().int().min(0).max(1000).default(30),
  maxAttemptsPerLead: z.number().int().min(1).max(5).default(2),
  retryAfterHours: z.number().int().min(1).max(336).default(48),
});

export type CallingSettings = z.infer<typeof CallingSettingsSchema>;

/** Hands-off mode: research a market, create a campaign, find leads, write and send the emails. */
export const AutopilotSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Limit the countries Autopilot may pick (empty = it chooses wherever the research says demand is). */
  allowedCountries: z.array(z.string().trim().min(2).max(64)).max(30).default([]),
  /** Limit the business types (empty = it chooses). */
  allowedCategories: z.array(z.string().trim().min(2).max(80)).max(30).default([]),
  /** Minimum hours between two researched campaigns. */
  newCampaignEveryHours: z.number().int().min(1).max(720).default(24),
  leadsPerCampaign: z.number().int().min(5).max(500).default(40),
  dailyEmailLimit: z.number().int().min(1).max(1000).default(20),
});

export type AutopilotSettings = z.infer<typeof AutopilotSettingsSchema>;

const SCHEMAS = { compliance: ComplianceSettingsSchema, general: GeneralSettingsSchema, offer: OfferSettingsSchema, calling: CallingSettingsSchema, autopilot: AutopilotSettingsSchema } as const;
export type SettingsKey = keyof typeof SCHEMAS;
type Key = SettingsKey;
type ValueOf<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

export async function getSettings<K extends Key>(key: K): Promise<ValueOf<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  const value = (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as ValueOf<K>;
  if (key === "offer") {
    const offer = value as OfferSettings;
    offer.includes = upgradeLegacyIncludes(offer.includes);
  }
  return value;
}

export async function saveSettings<K extends Key>(key: K, value: unknown): Promise<ValueOf<K>> {
  const data = SCHEMAS[key].parse(value) as ValueOf<K>;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: data as object },
    update: { value: data as object },
  });
  return data;
}
