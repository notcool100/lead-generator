import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { CallNotAllowedError, placeCall } from "@/services/calling/callService";

/** "Call now": places one AI call immediately (all calling rules still apply). */
export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 10 }, async ({ params, session }) => {
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!lead) throw new HttpError(404, "Lead not found");
  try {
    const { callId } = await placeCall(lead.id, { trigger: "manual", userId: session.sub });
    return json({ ok: true, callId, message: "Calling… the transcript and outcome appear here when the call ends." });
  } catch (err) {
    if (err instanceof CallNotAllowedError) throw new HttpError(409, err.message);
    throw err;
  }
});
