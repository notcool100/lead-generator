import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";

export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 30 }, async ({ params, session }) => {
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new HttpError(404, "Lead not found");
  if (lead.websiteStatus === "unknown") throw new HttpError(409, "Run the website check first");
  await enqueue("ai-analysis", { leadId: lead.id, force: true });
  await audit({ userId: session.sub, action: "lead.analyze", entityType: "lead", entityId: lead.id });
  return json({ ok: true, message: "AI analysis queued" });
});
