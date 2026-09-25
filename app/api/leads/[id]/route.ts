import { prisma } from "@/lib/db";
import { apiHandler, HttpError, json } from "@/lib/api";

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
    },
  });
  if (!lead) throw new HttpError(404, "Lead not found");
  return json({ lead });
});
