import { z } from "zod";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getEmailProvider } from "@/providers/email";
import { buildFooter, renderEmailBodies } from "@/services/email/EmailSender";
import { getSettings } from "@/services/compliance/settings";

const Body = z.object({ to: z.string().trim().email().max(200) });

/** Admin-only: sends one test email (to yourself) through the configured provider. */
export const POST = apiHandler({ role: "admin", rateLimit: 5 }, async ({ req, session }) => {
  const { to } = await parseBody(req, Body);
  const e = env();
  const s = await getSettings("compliance");
  const from = s.senderEmail ? `${s.senderName} <${s.senderEmail}>` : e.EMAIL_FROM;
  const { text, html } = renderEmailBodies(
    `Hi,\n\nThis is a test email from Lead Generator sent via "${e.EMAIL_PROVIDER}".\n\nIf you can read this, sending works. Reply to this message to test reply handling in your mail client.\n\nBest,\n${s.senderName}`,
    buildFooter(s, null),
  );
  try {
    const res = await getEmailProvider().send({ to, from, replyTo: s.replyTo || e.EMAIL_REPLY_TO, subject: "Lead Generator — test email", text, html });
    await audit({ userId: session.sub, action: "email.test", entityType: "settings", metadata: { to, provider: e.EMAIL_PROVIDER } });
    return json({ ok: true, message: `Sent to ${to} via ${e.EMAIL_PROVIDER} (${res.providerMessageId})` });
  } catch (err) {
    throw new HttpError(502, `Send failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});
