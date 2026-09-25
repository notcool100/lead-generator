import { analyzeBusiness } from "@/services/ai-analysis/BusinessAnalyzer";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const aiAnalysisWorker = () =>
  createWorker<JobPayloads["ai-analysis"]>("ai-analysis", async ({ leadId, force }) => analyzeBusiness(leadId, { force }), 2);
