import { prisma } from "@/lib/db";
import { leadEvent } from "@/lib/audit";
import type { NextAction } from "@/queue/queues";
import { shouldStopSequence } from "@/services/compliance/rules";
import { getSettings } from "@/services/compliance/settings";

/** After a message is sent, schedule the next step of the sequence (if allowed). */
export async function scheduleNextFollowup(messageId: string) {
  const msg = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
  const settings = await getSettings("compliance");
  const nextSeq = msg.sequenceNumber + 1;
  if (nextSeq > settings.maxFollowups) return null;
  const delayDays = settings.followupDelayDays[nextSeq - 1] ?? settings.followupDelayDays.at(-1) ?? 4;
  const prevDelay = msg.sequenceNumber === 0 ? 0 : (settings.followupDelayDays[msg.sequenceNumber - 1] ?? 0);
  const scheduledAt = new Date((msg.sentAt ?? new Date()).getTime() + Math.max(1, delayDays - prevDelay) * 86_400_000);
  return prisma.followup.create({ data: { leadId: msg.leadId, previousMessageId: msg.id, sequenceNumber: nextSeq, scheduledAt } });
}

/** Periodic scan: cancels sequences that must stop, and drafts due follow-ups. */
export async function processDueFollowups(now = new Date()): Promise<{ drafted: number; cancelled: number; next: NextAction[] }> {
  const due = await prisma.followup.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    include: { lead: { include: { outreachMessages: { include: { events: true } } } } },
    take: 200,
  });
  let drafted = 0;
  let cancelled = 0;
  const next: NextAction[] = [];

  for (const f of due) {
    const lead = f.lead;
    const suppressed = lead.email ? Boolean(await prisma.suppressionEntry.findUnique({ where: { email: lead.email } })) : false;
    const decision = shouldStopSequence({
      leadStatus: lead.status,
      unsubscribed: lead.unsubscribed,
      doNotContact: lead.doNotContact,
      suppressed,
      eventTypes: lead.outreachMessages.flatMap((m) => m.events.map((e) => e.eventType)),
    });
    if (decision.stop) {
      await prisma.followup.update({ where: { id: f.id }, data: { status: "cancelled", reason: decision.reason } });
      await leadEvent(lead.id, "followup_cancelled", `Follow-up #${f.sequenceNumber} cancelled (${decision.reason})`);
      cancelled++;
      continue;
    }
    await prisma.followup.update({ where: { id: f.id }, data: { status: "drafted" } });
    next.push({ queue: "outreach-draft", payload: { leadId: lead.id, sequenceNumber: f.sequenceNumber, followupId: f.id } });
    drafted++;
  }
  return { drafted, cancelled, next };
}

/** Cancels every pending follow-up for a lead (reply, unsubscribe, bounce, manual). */
export async function stopSequenceForLead(leadId: string, reason: string) {
  const res = await prisma.followup.updateMany({ where: { leadId, status: { in: ["scheduled", "drafted"] } }, data: { status: "cancelled", reason } });
  await prisma.outreachMessage.updateMany({ where: { leadId, sequenceNumber: { gt: 0 }, status: { in: ["draft", "approved", "queued"] } }, data: { status: "cancelled", error: `Sequence stopped: ${reason}` } });
  if (res.count) await leadEvent(leadId, "sequence_stopped", `Follow-up sequence stopped (${reason})`);
  return res.count;
}
