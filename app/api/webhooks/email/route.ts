import { type NextRequest } from "next/server";
import { errorResponse, HttpError, json } from "@/lib/api";
import { logger } from "@/lib/logger";
import { handleEmailEvent, normalizeWebhookPayload, verifyGenericSignature, verifySvixSignature } from "@/services/email/webhooks";

/**
 * Email provider webhook. Accepts:
 *  - Resend (Svix-signed) payloads
 *  - the normalized format, signed with x-webhook-signature / x-webhook-timestamp (HMAC-SHA256)
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Webhook secret not configured");
    const raw = await req.text();
    const svix = req.headers.has("svix-signature");
    const valid = svix ? verifySvixSignature(raw, req.headers, secret) : verifyGenericSignature(raw, req.headers, secret);
    if (!valid) throw new HttpError(401, "Invalid webhook signature");

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
    const events = Array.isArray(body) ? body : [body];
    const results = [];
    for (const e of events.slice(0, 100)) {
      const evt = normalizeWebhookPayload(e, req.headers.get("svix-id"));
      if (!evt) {
        results.push({ ignored: "unsupported event" });
        continue;
      }
      results.push(await handleEmailEvent(evt));
    }
    logger.info({ count: events.length }, "email webhook processed");
    return json({ ok: true, results });
  } catch (err) {
    return errorResponse(err);
  }
}
