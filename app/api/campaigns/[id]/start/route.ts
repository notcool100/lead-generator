import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";
import { CURSOR_DONE, DISCOVERY_BATCH_SIZE } from "@/services/lead-discovery/discoveryService";

export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ params, session }) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) throw new HttpError(404, "Campaign not found");
  if (campaign.status === "archived") throw new HttpError(409, "Archived campaigns cannot be started");
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "running", startedAt: campaign.startedAt ?? new Date() } });
  const count = await prisma.lead.count({ where: { campaignId: campaign.id } });
  if (campaign.discoveryCursor === CURSOR_DONE || count >= campaign.maxLeads) {
    await audit({ userId: session.sub, action: "campaign.start", entityType: "campaign", entityId: campaign.id });
    return json({ ok: true, message: count >= campaign.maxLeads ? "Campaign running — lead limit reached, no new discovery" : "Campaign running — all sources exhausted" });
  }
  await enqueue("lead-discovery", { campaignId: campaign.id });
  await audit({ userId: session.sub, action: "campaign.start", entityType: "campaign", entityId: campaign.id });
  return json({ ok: true, message: `Discovering up to ${Math.min(DISCOVERY_BATCH_SIZE, campaign.maxLeads - count)} new leads…` });
});
