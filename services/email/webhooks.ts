import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma, type EmailEventType, type Prisma } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import { suppressEmail } from "@/services/compliance/suppression";
import { stopSequenceForLead } from "@/services/followups/followupService";

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Generic signature: header `x-webhook-signature: sha256=<hex hmac of raw body>` + `x-webhook-timestamp` (5 min tolerance). */
export function verifyGenericSignature(rawBody: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const sig = headers.get("x-webhook-signature")?.replace(/^sha256=/, "");
  const ts = headers.get("x-webhook-timestamp");
  if (!sig || !ts || !/^\d+$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  return safeEqual(given, expected);
}

/** Svix signature (used by Resend): headers svix-id / svix-timestamp / svix-signature, secret "whsec_<base64>". */
export function verifySvixSignature(rawBody: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && sig ? safeEqual(Buffer.from(sig, "base64"), expected) : false;
  });
}

export const NormalizedEventSchema = z.object({
  type: z.enum(["sent", "delivered", "bounced", "complained", "opened", "clicked", "replied", "unsubscribed"]),
  providerMessageId: z.string().optional(),
  outreachMessageId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  providerEventId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

const RESEND_MAP: Record<string, NormalizedEvent["type"]> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

/** Accepts our normalized format or a Resend webhook payload. */
export function normalizeWebhookPayload(body: unknown, svixId?: string | null): NormalizedEvent | null {
  const direct = NormalizedEventSchema.safeParse(body);
  if (direct.success) return direct.data;
  const r = body as { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; tags?: Record<string, string> | { name: string; value: string }[] } };
  if (r?.type && RESEND_MAP[r.type]) {
    const tags = r.data?.tags;
    const tagId = Array.isArray(tags) ? tags.find((t) => t.name === "outreach_message_id")?.value : tags?.outreach_message_id;
    return {
      type: RESEND_MAP[r.type],
      providerMessageId: r.data?.email_id,
      outreachMessageId: tagId && /^[0-9a-f-]{36}$/i.test(tagId) ? tagId : undefined,
      email: r.data?.to?.[0],
      providerEventId: svixId ?? undefined,
      occurredAt: r.created_at,
    };
  }
  return null;
}

/** Records an email event and applies its compliance consequences. Idempotent on providerEventId. */
export async function handleEmailEvent(evt: NormalizedEvent) {
  const message = evt.outreachMessageId
    ? await prisma.outreachMessage.findUnique({ where: { id: evt.outreachMessageId } })
    : evt.providerMessageId
      ? await prisma.outreachMessage.findFirst({ where: { messageId: evt.providerMessageId } })
      : null;
  if (!message) return { ignored: "unknown message" };

  if (evt.providerEventId && (await prisma.emailEvent.findUnique({ where: { providerEventId: evt.providerEventId } }))) {
    return { ignored: "duplicate" };
  }
  await prisma.emailEvent.create({
    data: {
      outreachMessageId: message.id,
      eventType: evt.type as EmailEventType,
      providerEventId: evt.providerEventId,
      metadata: (evt.metadata ?? {}) as Prisma.InputJsonValue,
      occurredAt: evt.occurredAt ? new Date(evt.occurredAt) : new Date(),
    },
  });

  const email = evt.email ?? message.toEmail;
  switch (evt.type) {
    case "bounced":
      if (email) await suppressEmail(email, "bounced", "webhook");
      break;
    case "complained":
      if (email) await suppressEmail(email, "complaint", "webhook");
      break;
    case "unsubscribed":
      if (email) await suppressEmail(email, "unsubscribed", "webhook");
      break;
    case "replied":
      await prisma.lead.update({ where: { id: message.leadId }, data: { status: "replied" } });
      await stopSequenceForLead(message.leadId, "reply received");
      break;
  }
  if (["opened", "clicked", "replied", "bounced", "complained", "delivered"].includes(evt.type)) {
    await leadEvent(message.leadId, `email_${evt.type}`, `Email ${evt.type}`);
  }
  return { recorded: true };
}
