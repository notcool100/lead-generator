import { apiHandler, json, parseBody } from "@/lib/api";
import { SuppressSchema } from "@/lib/validation";
import { suppressLead } from "@/services/compliance/suppression";

export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const { reason } = await parseBody(req, SuppressSchema);
  await suppressLead(params.id, reason, session.sub);
  return json({ ok: true, message: "Lead suppressed; pending outreach cancelled" });
});
