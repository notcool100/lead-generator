import { prisma } from "@/lib/db";
import { apiHandler, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CampaignCreateSchema } from "@/lib/validation";
import { enqueue } from "@/queue/queues";
import { HttpError } from "@/lib/api";
import { sourceAvailability } from "@/providers/leads";

export const GET = apiHandler({}, async () => {
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { leads: true } } } });
  return json({ campaigns });
});

export const POST = apiHandler({ role: "operator" }, async ({ req, session }) => {
  const { launch, dncChecked, ...data } = await parseBody(req, CampaignCreateSchema);
  const unavailable = data.leadSources.filter((s) => !sourceAvailability(s).ok);
  if (unavailable.length) throw new HttpError(422, `Unavailable lead sources: ${unavailable.map((s) => `${s} (${sourceAvailability(s).reason})`).join(", ")}`);
  const campaign = await prisma.campaign.create({
    data: { ...data, dncCheckedAt: dncChecked ? new Date() : null, status: launch ? "running" : "draft", startedAt: launch ? new Date() : null, createdById: session.sub },
  });
  await audit({ userId: session.sub, action: "campaign.create", entityType: "campaign", entityId: campaign.id, metadata: { launch, autoSend: data.autoSendEnabled } });
  if (launch) await enqueue("lead-discovery", { campaignId: campaign.id });
  return json({ campaign }, 201);
});
