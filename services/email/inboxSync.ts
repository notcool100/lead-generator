import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { prisma } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { classifyInbound } from "./inboundClassifier";
import { handleEmailEvent } from "./webhooks";

interface SyncState {
  uidValidity: string;
  lastUid: number;
}

const STATE_KEY = "imap_sync";

export function imapConfigured() {
  const e = env();
  return Boolean(e.IMAP_HOST && e.IMAP_USER && e.IMAP_PASSWORD);
}

async function findMessage(refs: string[]) {
  if (!refs.length) return null;
  const candidates = refs.flatMap((r) => [`<${r}>`, r]);
  return prisma.outreachMessage.findFirst({ where: { messageId: { in: candidates } }, orderBy: { sentAt: "desc" } });
}

/**
 * Reads new mail in the outreach mailbox and turns it into email events:
 * human replies → "replied" (stops follow-ups), unsubscribe requests →
 * suppression, hard bounces → suppression. Messages are not modified.
 */
export async function syncInbox(): Promise<{ scanned: number; replies: number; bounces: number; unsubscribes: number }> {
  const e = env();
  if (!imapConfigured()) return { scanned: 0, replies: 0, bounces: 0, unsubscribes: 0 };
  const ourDomain = e.IMAP_USER!.split("@")[1];
  const client = new ImapFlow({ host: e.IMAP_HOST!, port: e.IMAP_PORT, secure: e.IMAP_PORT === 993, auth: { user: e.IMAP_USER!, pass: e.IMAP_PASSWORD! }, logger: false });
  const stats = { scanned: 0, replies: 0, bounces: 0, unsubscribes: 0 };

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    if (!box || typeof box === "boolean") throw new Error("Could not open INBOX");
    const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
    let state = row?.value as SyncState | undefined;
    if (!state || state.uidValidity !== String(box.uidValidity)) {
      // First run (or mailbox reset): look back 14 days.
      const since = new Date(Date.now() - 14 * 86_400_000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      state = { uidValidity: String(box.uidValidity), lastUid: uids.length ? Math.min(...uids) - 1 : Math.max(0, Number(box.uidNext) - 1) };
    }

    let maxUid = state.lastUid;
    for await (const msg of client.fetch(`${state.lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= state.lastUid || !msg.source) continue;
      maxUid = Math.max(maxUid, msg.uid);
      stats.scanned++;
      const raw = msg.source.toString("utf8");
      const parsed = await simpleParser(msg.source);
      const from = (parsed.from as AddressObject | undefined)?.value?.[0]?.address ?? "";
      if (from.toLowerCase() === e.IMAP_USER!.toLowerCase()) continue; // our own copies

      const c = classifyInbound(
        {
          from,
          subject: parsed.subject ?? "",
          text: parsed.text ?? "",
          headers: Object.fromEntries([...parsed.headers.entries()].map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
          inReplyTo: parsed.inReplyTo ?? null,
          references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
          raw: raw.slice(0, 200_000),
          contentType: parsed.headers.get("content-type") ? JSON.stringify(parsed.headers.get("content-type")) : "",
        },
        ourDomain,
      );
      const message = await findMessage(c.refs);
      if (!message) continue;
      const eventId = `imap:${state.uidValidity}:${msg.uid}`;
      const meta = { from, subject: parsed.subject ?? "", snippet: c.snippet };

      switch (c.kind) {
        case "bounce_hard":
          await handleEmailEvent({ type: "bounced", outreachMessageId: message.id, providerEventId: eventId, metadata: meta });
          stats.bounces++;
          break;
        case "unsubscribe":
          await handleEmailEvent({ type: "unsubscribed", outreachMessageId: message.id, email: from || undefined, providerEventId: eventId, metadata: meta });
          await leadEvent(message.leadId, "reply_received", `Unsubscribe request from ${from}: "${c.snippet.slice(0, 160)}"`);
          stats.unsubscribes++;
          break;
        case "reply":
          await handleEmailEvent({ type: "replied", outreachMessageId: message.id, providerEventId: eventId, metadata: meta });
          await leadEvent(message.leadId, "reply_received", `Reply from ${from}: "${c.snippet.slice(0, 200)}"`);
          stats.replies++;
          break;
        case "auto_reply":
          await leadEvent(message.leadId, "auto_reply", `Auto-reply received (${parsed.subject ?? ""}) — sequence continues`);
          break;
        default:
          break;
      }
    }
    await prisma.setting.upsert({
      where: { key: STATE_KEY },
      create: { key: STATE_KEY, value: { uidValidity: state.uidValidity, lastUid: maxUid, lastSyncAt: new Date().toISOString() } },
      update: { value: { uidValidity: state.uidValidity, lastUid: maxUid, lastSyncAt: new Date().toISOString() } },
    });
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  if (stats.scanned) logger.info(stats, "inbox sync");
  return stats;
}
