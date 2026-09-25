import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { generateOutreachDraft, OutreachNotPossibleError } from "@/services/outreach/OutreachGenerator";

/** Synchronous on purpose: a single draft is one short AI call and the user is waiting on it. */
export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 20 }, async ({ params, session }) => {
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new HttpError(404, "Lead not found");
  try {
    const { messageId } = await generateOutreachDraft(lead.id, { regenerate: true, userId: session.sub });
    return json({ ok: true, messageId, message: "Draft generated" });
  } catch (err) {
    if (err instanceof OutreachNotPossibleError) throw new HttpError(409, err.message);
    throw err;
  }
});
