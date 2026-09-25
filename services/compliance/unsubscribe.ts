import { createHmac, timingSafeEqual } from "node:crypto";

/** Stateless, signed unsubscribe token: base64url(json).base64url(hmac). Never expires. */
function secret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is required for unsubscribe tokens");
  return s;
}

export function createUnsubscribeToken(data: { email: string; leadId?: string; campaignId?: string | null }): string {
  const payload = Buffer.from(JSON.stringify({ e: data.email.toLowerCase(), l: data.leadId, c: data.campaignId ?? undefined })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(`unsub:${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { email: string; leadId?: string; campaignId?: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`unsub:${payload}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e: string; l?: string; c?: string };
    return { email: d.e, leadId: d.l, campaignId: d.c };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/unsubscribe/${token}`;
}
