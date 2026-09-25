import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type { EmailProvider, OutgoingEmail, SendResult } from "./EmailProvider";

/** Development provider: records the email in logs, never delivers it. */
export class LogEmailProvider implements EmailProvider {
  readonly name = "log";
  readonly sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<SendResult> {
    this.sent.push(email);
    logger.info({ to: email.to, subject: email.subject }, "[log email provider] email not delivered (dev mode)");
    return { providerMessageId: `log_${randomUUID()}` };
  }
}
