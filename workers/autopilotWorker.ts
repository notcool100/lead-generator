import { runAutopilotCycle } from "@/services/autopilot/autopilotService";
import type { JobPayloads } from "@/queue/queues";
import { createWorker } from "./runtime";

export const autopilotWorker = () =>
  createWorker<JobPayloads["autopilot"]>("autopilot", async () => {
    const res = await runAutopilotCycle();
    return { next: res.next, result: res.summary };
  }, 1);
