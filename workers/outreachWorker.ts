import { generateOutreachDraft, OutreachNotPossibleError } from "@/services/outreach/OutreachGenerator";
import { sendOutreachMessage } from "@/services/email/EmailSender";
import { EmailProviderError } from "@/providers/email/EmailProvider";
import type { JobPayloads } from "@/queue/queues";
import { createWorker, PermanentJobError } from "./runtime";

export const outreachDraftWorker = () =>
  createWorker<JobPayloads["outreach-draft"]>("outreach-draft", async ({ leadId, sequenceNumber, followupId }) => {
    try {
      return await generateOutreachDraft(leadId, { sequenceNumber, followupId });
    } catch (err) {
      if (err instanceof OutreachNotPossibleError) throw new PermanentJobError(err.message);
      throw err;
    }
  }, 2);

/** Concurrency 1: sends are serialised so rate limits are exact. */
export const emailSendWorker = () =>
  createWorker<JobPayloads["email-send"]>("email-send", async ({ messageId }) => {
    try {
      return { result: await sendOutreachMessage(messageId) };
    } catch (err) {
      if (err instanceof EmailProviderError && !err.transient) throw new PermanentJobError(err.message);
      throw err;
    }
  }, 1);
