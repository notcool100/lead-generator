import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { normalizeWebhookPayload, verifyGenericSignature, verifySvixSignature } from "@/services/email/webhooks";

describe("rate limiting", () => {
  it("allows up to the limit then blocks until the window resets", async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(() => t);
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 3, 1000)).allowed).toBe(true);
    expect((await rl.hit("k", 3, 1000)).allowed).toBe(false);
    expect((await rl.hit("other", 3, 1000)).allowed).toBe(true);
    t = 1001;
    expect((await rl.hit("k", 3, 1000)).allowed).toBe(true);
  });
});

describe("webhook validation", () => {
  const secret = "s3cret";
  const body = JSON.stringify({ type: "bounced", providerMessageId: "m1" });
  const now = 1_790_000_000_000;
  const ts = String(now / 1000);

  it("accepts a valid generic HMAC signature", () => {
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const h = new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": `sha256=${sig}` });
    expect(verifyGenericSignature(body, h, secret, now)).toBe(true);
  });
  it("rejects tampered bodies, bad signatures and stale timestamps", () => {
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const h = new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": `sha256=${sig}` });
    expect(verifyGenericSignature(body + " ", h, secret, now)).toBe(false);
    expect(verifyGenericSignature(body, new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": "sha256=00" }), secret, now)).toBe(false);
    expect(verifyGenericSignature(body, h, secret, now + 10 * 60_000)).toBe(false);
    expect(verifyGenericSignature(body, new Headers(), secret, now)).toBe(false);
  });
  it("verifies Svix (Resend) signatures", () => {
    const key = Buffer.from("resend-key").toString("base64");
    const sig = createHmac("sha256", Buffer.from(key, "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    const h = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,wrong v1,${sig}` });
    expect(verifySvixSignature(body, h, `whsec_${key}`, now)).toBe(true);
    expect(verifySvixSignature(body.replace("m1", "m2"), h, `whsec_${key}`, now)).toBe(false);
  });
  it("normalises Resend and generic payloads", () => {
    expect(normalizeWebhookPayload({ type: "email.complained", data: { email_id: "e1", to: ["a@b.co"] } }, "svix1")).toMatchObject({ type: "complained", providerMessageId: "e1", email: "a@b.co", providerEventId: "svix1" });
    expect(normalizeWebhookPayload({ type: "replied", providerMessageId: "x" })?.type).toBe("replied");
    expect(normalizeWebhookPayload({ type: "hacked" })).toBeNull();
  });
});
