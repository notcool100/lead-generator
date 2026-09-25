import { prisma } from "@/lib/db";
import { humanize } from "@/lib/utils";

export async function getAnalytics() {
  const [
    totalLeads, qualified, noWebsite, poorWebsites, previews, emailsSent, replies, interested, converted,
    byCategory, byCountry, byWebsite, byStatus, campaigns, events,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: { notIn: ["discovered", "rejected", "suppressed"] } } }),
    prisma.lead.count({ where: { websiteStatus: "no_website" } }),
    prisma.lead.count({ where: { websiteStatus: { in: ["poor_website", "outdated"] } } }),
    prisma.websitePreview.count({ where: { deploymentStatus: "deployed" } }),
    prisma.outreachMessage.count({ where: { status: "sent" } }),
    prisma.lead.count({ where: { status: { in: ["replied", "interested", "not_interested", "converted"] } } }),
    prisma.lead.count({ where: { status: "interested" } }),
    prisma.lead.count({ where: { status: "converted" } }),
    prisma.lead.groupBy({ by: ["category"], _count: { _all: true }, orderBy: { _count: { category: "desc" } }, take: 8 }),
    prisma.lead.groupBy({ by: ["country"], _count: { _all: true }, orderBy: { _count: { country: "desc" } }, take: 8 }),
    prisma.lead.groupBy({ by: ["websiteStatus"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, name: true,
        _count: { select: { leads: true } },
        leads: { select: { status: true } },
        outreachMessages: { where: { status: "sent" }, select: { id: true } },
      },
    }),
    prisma.emailEvent.groupBy({ by: ["eventType"], _count: { _all: true } }),
  ]);

  const statusCount = (s: string[]) => byStatus.filter((r) => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  const after = (from: string) => {
    const order = ["qualified", "analyzing", "analyzed", "preview_generating", "preview_ready", "outreach_draft", "approved", "contacted", "replied", "interested", "not_interested", "converted"];
    return statusCount(order.slice(order.indexOf(from)));
  };

  return {
    cards: { totalLeads, qualified, noWebsite, poorWebsites, previews, emailsSent, replies, interested, converted },
    byCategory: byCategory.map((r) => ({ name: humanize(r.category), value: r._count._all })),
    byCountry: byCountry.map((r) => ({ name: r.country, value: r._count._all })),
    byWebsiteStatus: byWebsite.map((r) => ({ name: humanize(r.websiteStatus), value: r._count._all })).sort((a, b) => b.value - a.value),
    funnel: [
      { name: "Discovered", value: totalLeads },
      { name: "Qualified", value: after("qualified") },
      { name: "Analyzed", value: after("analyzed") },
      { name: "Preview", value: after("preview_ready") },
      { name: "Contacted", value: after("contacted") },
      { name: "Replied", value: after("replied") },
      { name: "Converted", value: statusCount(["converted"]) },
    ],
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      leads: c._count.leads,
      qualified: c.leads.filter((l) => !["discovered", "rejected"].includes(l.status)).length,
      sent: c.outreachMessages.length,
      replied: c.leads.filter((l) => ["replied", "interested", "not_interested", "converted"].includes(l.status)).length,
      converted: c.leads.filter((l) => l.status === "converted").length,
    })),
    emailEvents: Object.fromEntries(events.map((e) => [e.eventType, e._count._all])) as Record<string, number>,
  };
}
