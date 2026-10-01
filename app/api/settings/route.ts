import { z } from "zod";
import { apiHandler, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getSettings, saveSettings } from "@/services/compliance/settings";

/** Non-secret settings only. Secrets are env vars and are never returned. */
export const GET = apiHandler({ role: "admin" }, async () => {
  const e = env();
  return json({
    compliance: await getSettings("compliance"),
    general: await getSettings("general"),
    offer: await getSettings("offer"),
    calling: await getSettings("calling"),
    providers: {
      ai: { provider: e.AI_PROVIDER, model: e.AI_MODEL, smallModel: e.AI_SMALL_MODEL, configured: Boolean(e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY) },
      leads: { provider: e.LEAD_PROVIDER, configured: Boolean(e.LEAD_PROVIDER_API_KEY) || e.LEAD_PROVIDER === "mock" },
      email: { provider: e.EMAIL_PROVIDER, configured: Boolean(e.EMAIL_API_KEY) || e.EMAIL_PROVIDER === "log" },
      deployment: { provider: e.DEPLOYMENT_PROVIDER, baseDomain: e.PREVIEW_BASE_DOMAIN ?? null },
    },
  });
});

const Body = z.object({ key: z.enum(["compliance", "general", "offer", "calling"]), value: z.unknown() });

export const PUT = apiHandler({ role: "admin" }, async ({ req, session }) => {
  const { key, value } = await parseBody(req, Body);
  const saved = await saveSettings(key, value);
  await audit({ userId: session.sub, action: `settings.${key}.update`, entityType: "settings", entityId: key, metadata: saved as object });
  return json({ ok: true, message: "Settings saved", value: saved });
});
