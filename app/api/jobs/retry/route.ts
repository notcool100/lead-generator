import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue, QUEUES, type QueueName } from "@/queue/queues";

const Body = z.object({ jobId: z.string().uuid() });

export const POST = apiHandler({ role: "admin" }, async ({ req, session }) => {
  const { jobId } = await parseBody(req, Body);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, "Job not found");
  if (job.status !== "failed") throw new HttpError(409, "Only failed jobs can be retried");
  if (!(Object.values(QUEUES) as string[]).includes(job.type)) throw new HttpError(400, "Unknown job type");
  const { _jobRecordId, ...payload } = job.payload as Record<string, unknown>;
  void _jobRecordId;
  const newId = await enqueue(job.type as QueueName, payload as never);
  await audit({ userId: session.sub, action: "job.retry", entityType: "job", entityId: job.id, metadata: { newJobId: newId } });
  return json({ ok: true, message: "Job re-queued" });
});
