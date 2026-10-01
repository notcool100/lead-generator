import { prisma } from "@/lib/db";
import { z } from "zod";
import { apiHandler, HttpError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

export const GET = apiHandler<{ id: string }>({}, async ({ params }) => {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      campaign: true,
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      websiteChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      previews: { include: { template: true } },
      outreachMessages: { orderBy: { createdAt: "desc" }, include: { events: true } },
      followups: { orderBy: { scheduledAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      calls: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) throw new HttpError(404, "Lead not found");
  return json({ lead });
});

const PatchBody = z.object({ notes: z.string().max(5000).nullable() });

export const PATCH = apiHandler<{ id: string }>({ role: "operator" }, async ({ req, params, session }) => {
  const { notes } = await parseBody(req, PatchBody);
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!lead) throw new HttpError(404, "Lead not found");
  await prisma.lead.update({ where: { id: lead.id }, data: { notes: notes?.trim() || null } });
  await audit({ userId: session.sub, action: "lead.notes", entityType: "lead", entityId: lead.id });
  return json({ ok: true, message: "Notes saved" });
});
