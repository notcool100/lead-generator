import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CampaignUpdateSchema } from "@/lib/validation";
import { queueAutoCalls } from "@/services/calling/callService";

export const GET = apiHandler<{ id: string }>({}, async ({ params }) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id }, include: { _count: { select: { leads: true, outreachMessages: true } } } });
  if (!campaign) throw new HttpError(404, "Campaign not found");
  return json({ campaign });
});

export const PATCH = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const { dncChecked, ...data } = await parseBody(req, CampaignUpdateSchema);
  const before = await prisma.campaign.findUnique({ where: { id: params.id }, select: { callMode: true } });
  if (!before) throw new HttpError(404, "Campaign not found");
  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: { ...data, ...(dncChecked === undefined ? {} : { dncCheckedAt: dncChecked ? new Date() : null }) },
  });
  await audit({ userId: session.sub, action: "campaign.update", entityType: "campaign", entityId: campaign.id, metadata: { ...data, ...(dncChecked === undefined ? {} : { dncChecked }) } });
  // Switching to Automatic (or confirming the Do Not Call check) queues every ready lead; calls wait for calling hours.
  const queued = campaign.callMode === "auto" && (before.callMode !== "auto" || dncChecked) ? await queueAutoCalls(campaign.id) : 0;
  const message = queued
    ? `${queued} lead${queued === 1 ? "" : "s"} queued — calls go out during calling hours, about 2 minutes apart.`
    : campaign.callMode === "auto" && before.callMode !== "auto"
      ? "Automatic calling on — leads are called once their preview is ready."
      : undefined;
  return json({ campaign, queued, message });
});
