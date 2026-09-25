import { prisma, type Prisma } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { LeadListQuerySchema } from "@/lib/validation";

export const GET = apiHandler({}, async ({ req }) => {
  const q = LeadListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const where: Prisma.LeadWhereInput = {
    ...(q.q ? { businessName: { contains: q.q, mode: "insensitive" } } : {}),
    ...(q.status ? { status: q.status as Prisma.LeadWhereInput["status"] } : {}),
    ...(q.websiteStatus ? { websiteStatus: q.websiteStatus } : {}),
    ...(q.campaignId ? { campaignId: q.campaignId } : {}),
    ...(q.country ? { country: { equals: q.country, mode: "insensitive" } } : {}),
    ...(q.category ? { category: { equals: q.category, mode: "insensitive" } } : {}),
  };
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { leadScore: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.lead.count({ where }),
  ]);
  return json({ leads, total, page: q.page, pageSize: q.pageSize });
});
