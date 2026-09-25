import { runWebsiteCheck } from "@/services/website-analysis/websiteCheckService";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const websiteAnalysisWorker = () =>
  createWorker<JobPayloads["website-analysis"]>("website-analysis", async ({ leadId }) => runWebsiteCheck(leadId), 5);
