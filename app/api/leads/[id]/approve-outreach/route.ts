import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit, leadEvent } from "@/lib/audit";
import { enqueue } from "@/queue/queues";

const Body = z.object({
  messageId: z.string().uuid(),
  subject: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(20).max(5000).optional(),
});

export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 60 }, async ({ req, params, session }) => {
  const input = await parseBody(req, Body);
  const msg = await prisma.outreachMessage.findFirst({ where: { id: input.messageId, leadId: params.id }, include: { lead: true } });
  if (!msg) throw new HttpError(404, "Message not found");
  if (msg.status !== "draft") throw new HttpError(409, `Message is ${msg.status}, not a draft`);
  if (msg.lead.doNotContact || msg.lead.unsubscribed) throw new HttpError(409, "Lead is do-not-contact");

  await prisma.outreachMessage.update({
    where: { id: msg.id },
    data: {
      subject: input.subject ?? msg.subject,
      body: input.body ?? msg.body,
      status: "approved",
      approvedById: session.sub,
      approvedAt: new Date(),
      error: null,
    },
  });
  if (msg.sequenceNumber === 0) await prisma.lead.update({ where: { id: msg.leadId }, data: { status: "approved" } });
  await enqueue("email-send", { messageId: msg.id });
  await leadEvent(msg.leadId, "outreach_approved", `Email approved by ${session.name}`);
  await audit({ userId: session.sub, action: "outreach.approve", entityType: "outreach_message", entityId: msg.id, metadata: { edited: Boolean(input.subject || input.body) } });
  return json({ ok: true, message: "Approved — queued for sending (subject to limits)" });
});
