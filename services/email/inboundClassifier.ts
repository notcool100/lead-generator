/**
 * Pure classification of an inbound email (unit tested). Decides whether a
 * message in the outreach mailbox is a bounce, an auto-reply, a human reply
 * or an unsubscribe request, and which of our Message-IDs it refers to.
 */
export interface InboundMail {
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
  inReplyTo: string | null;
  references: string[];
  /** Raw source — used to find the original Message-ID inside bounce reports. */
  raw: string;
  contentType: string;
}

export type InboundKind = "bounce_hard" | "bounce_soft" | "auto_reply" | "unsubscribe" | "reply" | "other";

export interface Classification {
  kind: InboundKind;
  refs: string[];
  snippet: string;
}

const norm = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();

export function extractIds(value: string | string[] | null | undefined): string[] {
  const s = Array.isArray(value) ? value.join(" ") : (value ?? "");
  return [...s.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].map((m) => norm(m[1]));
}

/** Visible reply text without quoted history or signatures. */
export function replyText(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue;
    if (/^On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From:\s/i.test(line) || /^--\s*$/.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

// Includes "no thanks" / "not interested": the email footer promises no further contact for those replies.
const UNSUBSCRIBE = /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact)|opt[\s-]?out|no,? thanks?|not interested)\b/i;

export function classifyInbound(m: InboundMail, ourDomain: string): Classification {
  const h = Object.fromEntries(Object.entries(m.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const fromLower = m.from.toLowerCase();
  const isDsn = /multipart\/report/i.test(m.contentType) && /delivery-status/i.test(m.contentType + m.raw.slice(0, 5000));
  const fromDaemon = /mailer-daemon|postmaster@|mail delivery (subsystem|system)/i.test(fromLower);

  if (isDsn || (fromDaemon && /undeliver|delivery status|failure|returned mail|not delivered/i.test(m.subject))) {
    const own = new Set(extractIds(h["message-id"]));
    const refs = extractIds(m.raw).filter((id) => !own.has(id) && id.endsWith(`@${ourDomain.toLowerCase()}`));
    const status = m.raw.match(/^Status:\s*([245])\.\d{1,3}\.\d{1,3}/im)?.[1];
    const action = m.raw.match(/^Action:\s*(\w+)/im)?.[1]?.toLowerCase();
    const soft = status === "4" || action === "delayed";
    return { kind: soft ? "bounce_soft" : "bounce_hard", refs, snippet: m.subject.slice(0, 200) };
  }

  const refs = [...new Set([...extractIds(m.inReplyTo), ...m.references.flatMap((r) => extractIds(r.includes("<") ? r : `<${r}>`))])];
  const visible = replyText(m.text);
  const snippet = visible.replace(/\s+/g, " ").slice(0, 300);

  const auto =
    (h["auto-submitted"] && h["auto-submitted"].toLowerCase() !== "no") ||
    "x-autoreply" in h || "x-autorespond" in h ||
    /auto_reply|bulk|junk/i.test(h["precedence"] ?? "") ||
    /^(out of office|automatic reply|auto(-|matic)?\s?reply|autoreply|abwesend|away from)/i.test(m.subject.replace(/^(re|aw|fwd?):\s*/i, ""));
  if (auto) return { kind: "auto_reply", refs, snippet };

  if (UNSUBSCRIBE.test(visible.slice(0, 600)) || /^\s*(unsubscribe|stop|remove)\s*$/i.test(m.subject.replace(/^re:\s*/i, ""))) {
    return { kind: "unsubscribe", refs, snippet };
  }
  return { kind: refs.length ? "reply" : "other", refs, snippet };
}
