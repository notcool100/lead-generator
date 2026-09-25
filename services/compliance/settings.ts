import { z } from "zod";
import { prisma } from "@/lib/db";

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
      subject: "A quick website preview for {{business_name}}",
      intro: "I came across {{business_name}} while researching {{category}} businesses in {{city}}.",
    }),
});

export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

const SCHEMAS = { compliance: ComplianceSettingsSchema, general: GeneralSettingsSchema } as const;
type Key = keyof typeof SCHEMAS;
type ValueOf<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

export async function getSettings<K extends Key>(key: K): Promise<ValueOf<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as ValueOf<K>;
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
