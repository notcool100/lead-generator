import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { errorMessage } from "@/lib/utils";
import { enqueueAll, type NextAction, type QueueName } from "@/queue/queues";
import { SendDeferredError } from "@/services/email/EmailSender";

export type Processor<T> = (data: T, job: Job) => Promise<{ next?: NextAction[]; result?: unknown } | void>;

/** Non-retryable errors: bad input / business-rule refusals. */
export class PermanentJobError extends Error {}

/**
 * Wraps a processor with: jobs-table bookkeeping, structured logs
 * (job id, lead id, campaign id, action, duration, outcome), next-step
 * enqueueing and deferred (rate-limited) rescheduling.
 */
export function createWorker<T extends object>(queue: QueueName, processor: Processor<T>, concurrency = 2, opts: { track?: boolean } = {}) {
  const track = opts.track ?? true;
  const worker = new Worker(
    queue,
    async (job: Job, token?: string) => {
      const data = job.data as T & { _jobRecordId?: string; leadId?: string; campaignId?: string };
      const started = Date.now();
      const log = logger.child({ jobId: job.id, queue, leadId: data.leadId, campaignId: data.campaignId, attempt: job.attemptsMade + 1 });
      if (!track) {
        // Frequent housekeeping jobs (e.g. inbox polling): log only, no jobs-table rows.
        const out = (await processor(data, job)) ?? {};
        if (out.next?.length) await enqueueAll(out.next);
        return out.result ?? null;
      }
      let recordId = data._jobRecordId;
      if (!recordId) {
        const rec = await prisma.job.create({ data: { type: queue, status: "queued", payload: data as Prisma.InputJsonValue, queueJobId: job.id ?? null } });
        recordId = rec.id;
        await job.updateData({ ...data, _jobRecordId: recordId });
      }
      await prisma.job.update({ where: { id: recordId }, data: { status: "processing", attempts: job.attemptsMade + 1, startedAt: new Date(), error: null } });
      log.info({ action: queue }, "job started");

      try {
        const out = (await processor(data, job)) ?? {};
        if (out.next?.length) await enqueueAll(out.next);
        const durationMs = Date.now() - started;
        await prisma.job.update({ where: { id: recordId }, data: { status: "completed", completedAt: new Date(), durationMs } });
        log.info({ action: queue, durationMs, success: true, nextJobs: out.next?.length ?? 0 }, "job completed");
        return out.result ?? null;
      } catch (err) {
        const durationMs = Date.now() - started;
        if (err instanceof SendDeferredError && token) {
          await prisma.job.update({ where: { id: recordId }, data: { status: "queued", error: `Deferred: ${err.message}`, durationMs } });
          log.info({ action: queue, retryAfterMs: err.retryAfterMs, reason: err.message }, "job deferred");
          await job.moveToDelayed(Date.now() + err.retryAfterMs, token);
          throw new DelayedError();
        }
        const final = err instanceof PermanentJobError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        await prisma.job.update({ where: { id: recordId }, data: { status: final ? "failed" : "queued", error: errorMessage(err), durationMs } });
        log.error({ action: queue, durationMs, success: false, err: errorMessage(err), final }, "job failed");
        if (err instanceof PermanentJobError) throw new UnrecoverableError(err.message);
        throw err;
      }
    },
    { connection: getRedis(), concurrency, autorun: false },
  );
  worker.on("error", (err) => logger.error({ err, queue }, "worker error"));
  return worker;
}
