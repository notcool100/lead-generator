import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";
import { getSettings } from "@/services/compliance/settings";

export const POST = apiHandler({ role: "admin" }, async ({ session }) => {
  if (!(await getSettings("autopilot")).enabled) throw new HttpError(409, "Turn Autopilot on first");
  await enqueue("autopilot", { tick: true });
  await audit({ userId: session.sub, action: "autopilot.run", entityType: "autopilot" });
  return json({ ok: true, message: "Autopilot is researching the next market…" });
});
