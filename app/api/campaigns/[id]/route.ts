import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CampaignUpdateSchema } from "@/lib/validation";

export const GET = apiHandler<{ id: string }>({}, async ({ params }) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id }, include: { _count: { select: { leads: true, outreachMessages: true } } } });
  if (!campaign) throw new HttpError(404, "Campaign not found");
  return json({ campaign });
});

export const PATCH = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const data = await parseBody(req, CampaignUpdateSchema);
  const campaign = await prisma.campaign.update({ where: { id: params.id }, data });
  await audit({ userId: session.sub, action: "campaign.update", entityType: "campaign", entityId: campaign.id, metadata: data });
  return json({ campaign });
});
