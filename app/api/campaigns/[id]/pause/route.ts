import { prisma } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { audit } from "@/lib/audit";

export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ params, session }) => {
  await prisma.campaign.update({ where: { id: params.id }, data: { status: "paused" } });
  await audit({ userId: session.sub, action: "campaign.pause", entityType: "campaign", entityId: params.id });
  return json({ ok: true, message: "Campaign paused" });
});
