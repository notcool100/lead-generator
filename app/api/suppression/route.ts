import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/normalize";
import { SuppressionAddSchema } from "@/lib/validation";
import { suppressEmail } from "@/services/compliance/suppression";

export const GET = apiHandler({}, async () => {
  const [global, campaign] = await Promise.all([
    prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.campaignSuppression.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  return json({ global, campaign });
});

export const POST = apiHandler({ role: "operator" }, async ({ req, session }) => {
  const { email, reason, campaignId } = await parseBody(req, SuppressionAddSchema);
  if (campaignId) {
    const e = normalizeEmail(email)!;
    await prisma.campaignSuppression.upsert({ where: { campaignId_email: { campaignId, email: e } }, create: { campaignId, email: e, reason }, update: { reason } });
    await audit({ userId: session.sub, action: "suppression.campaign_add", entityType: "campaign", entityId: campaignId, metadata: { email: e } });
    return json({ ok: true, message: "Added to campaign suppression list" });
  }
  const res = await suppressEmail(email, reason, "manual", session.sub);
  return json({ ok: true, message: `Suppressed; ${res.leadsAffected} lead(s) updated` });
});

/** Removal is admin-only and audited. Unsubscribes/complaints should never be removed without consent. */
export const DELETE = apiHandler({ role: "admin" }, async ({ req, session }) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
  const entry = await prisma.suppressionEntry.delete({ where: { id } });
  await audit({ userId: session.sub, action: "suppression.remove", entityType: "suppression", entityId: entry.email, metadata: { reason: entry.reason } });
  return json({ ok: true, message: "Removed from suppression list" });
});
