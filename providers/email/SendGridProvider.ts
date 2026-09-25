import { EmailProviderError, type EmailProvider, type OutgoingEmail, type SendResult } from "./EmailProvider";

function parseAddress(addr: string) {
  const m = addr.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: addr.trim() };
}

export class SendGridProvider implements EmailProvider {
  readonly name = "sendgrid";
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new EmailProviderError("EMAIL_API_KEY is required for SendGrid", false);
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }], custom_args: email.tag ? { outreach_message_id: email.tag } : undefined }],
        from: parseAddress(email.from),
        reply_to: email.replyTo ? parseAddress(email.replyTo) : undefined,
        subject: email.subject,
        headers: email.headers,
        content: [
          { type: "text/plain", value: email.text },
          { type: "text/html", value: email.html },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new EmailProviderError(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500 || res.status === 429);
    }
    return { providerMessageId: res.headers.get("x-message-id") ?? `sg_${Date.now()}` };
  }
}
