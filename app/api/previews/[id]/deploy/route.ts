import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enqueue } from "@/queue/queues";

export const POST = apiHandler<{ id: string }>({ role: "operator", rateLimit: 30 }, async ({ params, session }) => {
  const preview = await prisma.websitePreview.findUnique({ where: { id: params.id } });
  if (!preview) throw new HttpError(404, "Preview not found");
  await enqueue("deployment", { previewId: preview.id });
  await audit({ userId: session.sub, action: "preview.deploy", entityType: "website_preview", entityId: preview.id });
  return json({ ok: true, message: "Deployment queued" });
});
