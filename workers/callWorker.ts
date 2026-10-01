import { CallNotAllowedError, placeCall } from "@/services/calling/callService";
import { SendDeferredError } from "@/services/email/EmailSender";
import type { JobPayloads } from "@/queue/queues";
import { createWorker, PermanentJobError } from "./runtime";

/** Concurrency 1: calls are placed one at a time so daily limits are exact. */
export const callWorker = () =>
  createWorker<JobPayloads["call-place"]>("call-place", async ({ leadId, trigger }) => {
    try {
      return { result: await placeCall(leadId, { trigger }) };
    } catch (err) {
      if (err instanceof CallNotAllowedError) {
        // Outside calling hours / over the daily limit → wait; rule refusals → stop.
        if (!err.permanent) throw new SendDeferredError(err.message, err.retryAfterMs);
        throw new PermanentJobError(err.message);
      }
      throw err;
    }
  }, 1);
