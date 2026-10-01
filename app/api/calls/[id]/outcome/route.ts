import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CALL_OUTCOMES } from "@/prompts/cold-call";
import { applyOutcome } from "@/services/calling/callService";

const Body = z.object({ outcome: z.enum(CALL_OUTCOMES) });

/** Lets a person correct the AI-detected outcome after listening to the call. */
export const POST = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const { outcome } = await parseBody(req, Body);
  const call = await prisma.call.findUnique({ where: { id: params.id } });
  if (!call) throw new HttpError(404, "Call not found");
  if (call.outcome !== outcome) await applyOutcome(call.id, outcome, { firstOutcome: false, userId: session.sub });
  await audit({ userId: session.sub, action: "call.outcome", entityType: "call", entityId: call.id, metadata: { from: call.outcome, to: outcome } });
  return json({ ok: true });
});
