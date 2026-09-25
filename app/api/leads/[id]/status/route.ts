import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit, leadEvent } from "@/lib/audit";
import { LeadStatusUpdateSchema } from "@/lib/validation";
import { stopSequenceForLead } from "@/services/followups/followupService";

export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const { status, note } = await parseBody(req, LeadStatusUpdateSchema);
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new HttpError(404, "Lead not found");
  if (lead.status === "suppressed") throw new HttpError(409, "Suppressed leads cannot change status");
  await prisma.lead.update({ where: { id: lead.id }, data: { status } });
  if (["replied", "interested", "not_interested", "converted"].includes(status)) await stopSequenceForLead(lead.id, `marked ${status}`);
  await leadEvent(lead.id, "status_changed", `Status changed from ${lead.status} to ${status}${note ? ` — ${note}` : ""}`);
  await audit({ userId: session.sub, action: "lead.status", entityType: "lead", entityId: lead.id, metadata: { from: lead.status, to: status } });
  return json({ ok: true });
});
