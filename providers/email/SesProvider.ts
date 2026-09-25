import { createHash, createHmac } from "node:crypto";
import { EmailProviderError, type EmailProvider, type OutgoingEmail, type SendResult } from "./EmailProvider";

/**
 * Amazon SES v2 SendEmail with a minimal SigV4 signer (no AWS SDK dependency).
 * Credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION.
 */
export class SesProvider implements EmailProvider {
  readonly name = "ses";
  constructor(
    private readonly region: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
  ) {
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new EmailProviderError("AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES", false);
    }
  }

  private sign(body: string, amzDate: string, host: string, path: string) {
    const date = amzDate.slice(0, 8);
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
    const canonical = ["POST", path, "", `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`, "content-type;host;x-amz-date", hash(body)].join("\n");
    const scope = `${date}/${this.region}/ses/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonical)].join("\n");
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, date), this.region), "ses"), "aws4_request");
    const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
    return `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`;
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const host = `email.${this.region}.amazonaws.com`;
    const path = "/v2/email/outbound-emails";
    const body = JSON.stringify({
      FromEmailAddress: email.from,
      Destination: { ToAddresses: [email.to] },
      ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: email.subject, Charset: "UTF-8" },
          Body: { Text: { Data: email.text, Charset: "UTF-8" }, Html: { Data: email.html, Charset: "UTF-8" } },
          Headers: email.headers ? Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value })) : undefined,
        },
      },
      EmailTags: email.tag ? [{ Name: "outreach_message_id", Value: email.tag }] : undefined,
    });
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const res = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Amz-Date": amzDate, Authorization: this.sign(body, amzDate, host, path) },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new EmailProviderError(`SES ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500 || res.status === 429);
    const data = (await res.json()) as { MessageId: string };
    return { providerMessageId: data.MessageId };
  }
}
