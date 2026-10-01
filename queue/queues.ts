import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "@/lib/redis";
import { prisma, type Prisma } from "@/lib/db";

/**
 * Every background step is a BullMQ queue. The `jobs` table mirrors each job so
 * the admin UI can show history even after Redis evicts completed jobs.
 */
export const QUEUES = {
  leadDiscovery: "lead-discovery",
  websiteAnalysis: "website-analysis",
  aiAnalysis: "ai-analysis",
  previewGeneration: "preview-generation",
  deployment: "deployment",
  outreachDraft: "outreach-draft",
  emailSend: "email-send",
  followups: "followups",
  inboxSync: "inbox-sync",
  callPlace: "call-place",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  "lead-discovery": { campaignId: string };
  "website-analysis": { leadId: string };
  "ai-analysis": { leadId: string; force?: boolean };
  "preview-generation": { leadId: string; templateKey?: string };
  deployment: { previewId: string };
  "outreach-draft": { leadId: string; sequenceNumber?: number; followupId?: string };
  "email-send": { messageId: string };
  followups: { scan: true };
  "inbox-sync": { scan: true };
  "call-place": { leadId: string; trigger: "auto" | "retry" };
}

export type NextAction = { [Q in QueueName]: { queue: Q; payload: JobPayloads[Q]; opts?: JobsOptions } }[QueueName];

const DEFAULT_OPTS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

const g = globalThis as unknown as { __queues?: Map<string, Queue> };

export function getQueue(name: QueueName): Queue {
  g.__queues ??= new Map();
  let q = g.__queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getRedis(), defaultJobOptions: DEFAULT_OPTS });
    g.__queues.set(name, q);
  }
  return q;
}

function entityIds(payload: Record<string, unknown>) {
  return {
    leadId: typeof payload.leadId === "string" ? payload.leadId : null,
    campaignId: typeof payload.campaignId === "string" ? payload.campaignId : null,
  };
}

export async function enqueue<Q extends QueueName>(queue: Q, payload: JobPayloads[Q], opts?: JobsOptions) {
  const record = await prisma.job.create({
    data: {
      type: queue,
      status: "queued",
      payload: payload as Prisma.InputJsonValue,
      ...entityIds(payload as Record<string, unknown>),
    },
  });
  const job = await getQueue(queue).add(queue, { ...payload, _jobRecordId: record.id }, { ...opts });
  await prisma.job.update({ where: { id: record.id }, data: { queueJobId: job.id ?? null } });
  return record.id;
}

export async function enqueueAll(actions: NextAction[]) {
  for (const a of actions) await enqueue(a.queue, a.payload as never, a.opts);
}
