import { generatePreview } from "@/services/preview-generation/previewService";
import { deployPreview } from "@/services/deployment/PreviewDeploymentService";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const previewWorker = () =>
  createWorker<JobPayloads["preview-generation"]>("preview-generation", async ({ leadId, templateKey }) => generatePreview(leadId, { templateKey }), 2);

export const deploymentWorker = () =>
  createWorker<JobPayloads["deployment"]>("deployment", async ({ previewId }) => deployPreview(previewId), 2);
