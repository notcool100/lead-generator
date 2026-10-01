/**
 * Worker process entrypoint:  pnpm worker   (or the `worker` Docker service).
 * Runs independently of the web app so jobs continue during web restarts.
 */
import "dotenv/config";
import http from "node:http";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getQueue } from "@/queue/queues";
import { leadDiscoveryWorker } from "./leadDiscoveryWorker";
import { websiteAnalysisWorker } from "./websiteAnalysisWorker";
import { aiAnalysisWorker } from "./aiAnalysisWorker";
import { deploymentWorker, previewWorker } from "./previewWorker";
import { emailSendWorker, outreachDraftWorker } from "./outreachWorker";
import { followupWorker, inboxSyncWorker } from "./followupWorker";
import { callWorker } from "./callWorker";
import { imapConfigured } from "@/services/email/inboxSync";

process.env.SERVICE_NAME ??= "worker";

async function main() {
  const e = env();
  const workers = [
    leadDiscoveryWorker(),
    websiteAnalysisWorker(),
    aiAnalysisWorker(),
    previewWorker(),
    deploymentWorker(),
    outreachDraftWorker(),
    emailSendWorker(),
    followupWorker(),
    callWorker(),
    ...(imapConfigured() ? [inboxSyncWorker()] : []),
  ];

  await getQueue("followups").upsertJobScheduler("followup-scan", { every: 10 * 60_000 }, { name: "followups", data: { scan: true } });
  if (imapConfigured()) {
    // Poll the outreach mailbox for replies, unsubscribe requests and bounces.
    await getQueue("inbox-sync").upsertJobScheduler("inbox-sync", { every: 2 * 60_000 }, { name: "inbox-sync", data: { scan: true }, opts: { attempts: 1, removeOnComplete: { count: 200 } } });
  }

  for (const w of workers) void w.run();
  logger.info(
    { queues: workers.map((w) => w.name), aiProvider: e.AI_PROVIDER, leadProvider: e.LEAD_PROVIDER, emailProvider: e.EMAIL_PROVIDER },
    "workers started",
  );

  // Health endpoint for Docker / orchestrators.
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  const server = http
    .createServer((_req, res) => {
      const running = workers.every((w) => w.isRunning());
      res.writeHead(running ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: running }));
    })
    .listen(port);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down workers");
    server.close();
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
