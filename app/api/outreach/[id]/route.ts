import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { OutreachEditSchema } from "@/lib/validation";

export const PATCH = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const data = await parseBody(req, OutreachEditSchema);
  const msg = await prisma.outreachMessage.findUnique({ where: { id: params.id } });
  if (!msg) throw new HttpError(404, "Message not found");
  if (msg.status !== "draft") throw new HttpError(409, "Only drafts can be edited");
  await prisma.outreachMessage.update({ where: { id: msg.id }, data });
  await audit({ userId: session.sub, action: "outreach.edit", entityType: "outreach_message", entityId: msg.id });
  return json({ ok: true, message: "Draft saved" });
});
