import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";
import { TEMPLATE_KEYS } from "@/templates/registry";

const Body = z.object({ templateKey: z.enum(TEMPLATE_KEYS).optional() }).default({});

export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 30 }, async ({ req, params, session }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new HttpError(404, "Lead not found");
  if (lead.doNotContact) throw new HttpError(409, "Lead is suppressed");
  await enqueue("preview-generation", { leadId: lead.id, templateKey: body.templateKey });
  await audit({ userId: session.sub, action: "lead.generate_preview", entityType: "lead", entityId: lead.id, metadata: body });
  return json({ ok: true, message: "Preview generation queued" });
});
