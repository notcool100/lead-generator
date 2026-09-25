import { env } from "@/lib/env";
import type { EmailProvider } from "./EmailProvider";
import { ResendProvider } from "./ResendProvider";
import { SendGridProvider } from "./SendGridProvider";
import { SesProvider } from "./SesProvider";
import { LogEmailProvider } from "./LogEmailProvider";
import { SmtpEmailProvider } from "./SmtpEmailProvider";

let instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  const e = env();
  switch (e.EMAIL_PROVIDER) {
    case "smtp":
      instance = new SmtpEmailProvider({
        host: e.SMTP_HOST ?? "",
        port: e.SMTP_PORT,
        user: e.SMTP_USER ?? "",
        password: e.SMTP_PASSWORD ?? "",
        imap: e.IMAP_HOST && e.IMAP_USER && e.IMAP_PASSWORD ? { host: e.IMAP_HOST, port: e.IMAP_PORT, user: e.IMAP_USER, password: e.IMAP_PASSWORD } : null,
      });
      break;
    case "resend":
      instance = new ResendProvider(e.EMAIL_API_KEY ?? "");
      break;
    case "sendgrid":
      instance = new SendGridProvider(e.EMAIL_API_KEY ?? "");
      break;
    case "ses":
      instance = new SesProvider(e.AWS_REGION ?? "", process.env.AWS_ACCESS_KEY_ID ?? "", process.env.AWS_SECRET_ACCESS_KEY ?? "");
      break;
    default:
      instance = new LogEmailProvider();
  }
  return instance;
}

export function setEmailProviderForTests(p: EmailProvider | null) {
  instance = p;
}

export type { EmailProvider };
