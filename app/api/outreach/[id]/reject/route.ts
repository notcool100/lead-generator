import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit, leadEvent } from "@/lib/audit";

export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ params, session }) => {
  const msg = await prisma.outreachMessage.findUnique({ where: { id: params.id } });
  if (!msg) throw new HttpError(404, "Message not found");
  if (!["draft", "approved", "queued"].includes(msg.status)) throw new HttpError(409, `Cannot reject a ${msg.status} message`);
  await prisma.outreachMessage.update({ where: { id: msg.id }, data: { status: "rejected" } });
  await leadEvent(msg.leadId, "outreach_rejected", `Draft rejected by ${session.name}`);
  await audit({ userId: session.sub, action: "outreach.reject", entityType: "outreach_message", entityId: msg.id });
  return json({ ok: true, message: "Draft rejected" });
});
