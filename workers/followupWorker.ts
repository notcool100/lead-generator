import { processDueFollowups } from "@/services/followups/followupService";
import { syncInbox } from "@/services/email/inboxSync";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const followupWorker = () =>
  createWorker<JobPayloads["followups"]>("followups", async () => {
    const res = await processDueFollowups();
    return { next: res.next, result: { drafted: res.drafted, cancelled: res.cancelled } };
  }, 1);

export const inboxSyncWorker = () =>
  createWorker<JobPayloads["inbox-sync"]>("inbox-sync", async () => ({ result: await syncInbox() }), 1, { track: false });
