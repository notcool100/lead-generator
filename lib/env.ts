import { z } from "zod";

/**
 * Server-side environment. Never import this file from a client component —
 * it contains secrets.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters"),

  AI_PROVIDER: z.enum(["claude_code", "anthropic", "openai", "mock"]).default("claude_code"),
  CLAUDE_CODE_MODEL: z.string().default("opus"),
  CLAUDE_CODE_SMALL_MODEL: z.string().default("haiku"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5"),
  AI_SMALL_MODEL: z.string().default("claude-haiku-4-5"),

  /** Comma-separated default sources: google_places, openstreetmap, web_search, yelp, mock */
  LEAD_PROVIDER: z.string().default("openstreetmap,web_search"),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  YELP_API_KEY: z.string().optional(),
  OVERPASS_URLS: z.string().default("https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.kumi.systems/api/interpreter"),
  OSM_CONTACT: z.string().optional(),
  LEAD_PROVIDER_API_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["smtp", "resend", "sendgrid", "ses", "log"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** IMAP mailbox that receives replies and bounces (enables automatic reply detection). */
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Lead Generator <outreach@example.com>"),
  EMAIL_REPLY_TO: z.string().optional(),
  EMAIL_WEBHOOK_SECRET: z.string().optional(),
  AWS_REGION: z.string().optional(),

  PREVIEW_BASE_DOMAIN: z.string().optional(),
  DEPLOYMENT_PROVIDER: z.enum(["vps", "static", "vercel"]).default("vps"),
  DEPLOYMENT_API_KEY: z.string().optional(),
  PREVIEW_OUTPUT_DIR: z.string().default("./storage/previews"),

  UNSPLASH_ACCESS_KEY: z.string().optional(),
  ALLOW_PRIVATE_NETWORK_FETCH: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

function blankToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) out[k] = v === "" ? undefined : v;
  return out;
}

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(blankToUndefined(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — forces env() to re-read process.env. */
export function resetEnvCache() {
  cached = null;
}
