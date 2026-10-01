import { type NextRequest } from "next/server";
import { errorResponse, HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyRetellSignature, type RetellWebhookEvent } from "@/providers/calling/RetellClient";
import { handleRetellEvent } from "@/services/calling/callService";

/** Retell call webhook (call_started / call_ended / call_analyzed), signed with the Retell API key. */
export async function POST(req: NextRequest) {
  try {
    const apiKey = env().RETELL_API_KEY;
    if (!apiKey) throw new HttpError(503, "Retell not configured");
    const raw = await req.text();
    if (!verifyRetellSignature(raw, req.headers.get("x-retell-signature"), apiKey)) throw new HttpError(401, "Invalid webhook signature");

    let evt: RetellWebhookEvent;
    try {
      evt = JSON.parse(raw) as RetellWebhookEvent;
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
    const res = await handleRetellEvent(evt);
    logger.info({ event: evt.event, retellCallId: evt.call?.call_id, ...res }, "retell webhook processed");
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
