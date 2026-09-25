import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { logger } from "@/lib/logger";
import { EmailProviderError, type EmailProvider, type OutgoingEmail, type SendResult } from "./EmailProvider";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Optional IMAP settings to save a copy into the mailbox's Sent folder. */
  imap?: { host: string; port: number; user: string; password: string } | null;
}

/**
 * Sends through your own mail server (e.g. mailcow) over authenticated SMTP.
 * We set our own Message-ID so replies/bounces can be matched later by the
 * IMAP inbox sync (In-Reply-To / References / DSN headers).
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport: Transporter;

  constructor(private readonly cfg: SmtpConfig) {
    if (!cfg.host || !cfg.user || !cfg.password) throw new EmailProviderError("SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required for EMAIL_PROVIDER=smtp", false);
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      requireTLS: cfg.port !== 465,
      auth: { user: cfg.user, pass: cfg.password },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
    });
  }

  private domain() {
    return this.cfg.user.split("@")[1] ?? this.cfg.host;
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const messageId = `<${randomUUID()}@${this.domain()}>`;
    const message = {
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      messageId,
      headers: { ...email.headers, ...(email.tag ? { "X-Outreach-Id": email.tag } : {}) },
      // Envelope sender must be the authenticated mailbox so bounces come back to it.
      envelope: { from: this.cfg.user, to: email.to },
    };
    try {
      const info = await this.transport.sendMail(message);
      if (info.rejected?.length) throw new EmailProviderError(`Recipient rejected: ${info.rejected.join(", ")}`, false);
    } catch (err) {
      if (err instanceof EmailProviderError) throw err;
      const e = err as { responseCode?: number; message?: string };
      // 4xx = temporary (retry), 5xx = permanent
      throw new EmailProviderError(`SMTP error: ${e.message ?? String(err)}`, !e.responseCode || e.responseCode < 500);
    }
    await this.saveToSent(message).catch((err) => logger.warn({ err: String(err) }, "could not save copy to Sent folder"));
    return { providerMessageId: messageId };
  }

  private async saveToSent(message: object) {
    if (!this.cfg.imap) return;
    const raw = await new MailComposer(message).compile().build();
    const client = new ImapFlow({ host: this.cfg.imap.host, port: this.cfg.imap.port, secure: true, auth: { user: this.cfg.imap.user, pass: this.cfg.imap.password }, logger: false });
    await client.connect();
    try {
      const boxes = await client.list();
      const sent = boxes.find((b) => b.specialUse === "\\Sent")?.path ?? "Sent";
      await client.append(sent, raw, ["\\Seen"]);
    } finally {
      await client.logout();
    }
  }
}
