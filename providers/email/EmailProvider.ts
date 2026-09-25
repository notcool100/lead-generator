export interface OutgoingEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  /** Internal id, echoed back in provider webhooks where supported. */
  tag?: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SendResult>;
}

export class EmailProviderError extends Error {
  constructor(message: string, public readonly transient: boolean) {
    super(message);
  }
}

/** RFC 2606 / 6761 reserved domains — never deliverable, never attempted. */
export function isReservedDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return /(^|\.)(example|test|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|org|net)$/.test(domain);
}
