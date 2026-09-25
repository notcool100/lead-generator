import { EmailProviderError, type EmailProvider, type OutgoingEmail, type SendResult } from "./EmailProvider";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new EmailProviderError("EMAIL_API_KEY is required for Resend", false);
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.headers,
        tags: email.tag ? [{ name: "outreach_message_id", value: email.tag.replace(/[^a-zA-Z0-9_-]/g, "_") }] : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new EmailProviderError(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500 || res.status === 429);
    }
    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id };
  }
}
