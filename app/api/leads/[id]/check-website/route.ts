import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";

export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 30 }, async ({ params, session }) => {
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new HttpError(404, "Lead not found");
  await enqueue("website-analysis", { leadId: lead.id });
  await audit({ userId: session.sub, action: "lead.check_website", entityType: "lead", entityId: lead.id });
  return json({ ok: true, message: "Website check queued" });
});
