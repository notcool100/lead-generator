import { discoverLeadsForCampaign } from "@/services/lead-discovery/discoveryService";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const leadDiscoveryWorker = () =>
  createWorker<JobPayloads["lead-discovery"]>("lead-discovery", async ({ campaignId }) => {
    const res = await discoverLeadsForCampaign(campaignId);
    return { next: res.next, result: { created: res.created, duplicates: res.duplicates } };
  }, 1);
