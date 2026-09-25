import Link from "next/link";
import { Plus } from "lucide-react";
import { DonutChart, FunnelChart, HBarChart } from "@/components/charts";
import { PageHeader, Stat } from "@/components/page-header";
import { LeadStatusBadge, WebsiteStatusBadge } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { getAnalytics } from "@/services/analytics";

export default async function DashboardPage() {
  const [a, recent] = await Promise.all([
    getAnalytics(),
    prisma.lead.findMany({ orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, businessName: true, city: true, status: true, websiteStatus: true, updatedAt: true } }),
  ]);
  const c = a.cards;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Pipeline health across all campaigns."
        actions={
          <Link href="/campaigns/new" className={buttonVariants()}>
            <Plus /> New campaign
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total leads" value={c.totalLeads} />
        <Stat label="Qualified leads" value={c.qualified} />
        <Stat label="No website" value={c.noWebsite} />
        <Stat label="Poor / outdated websites" value={c.poorWebsites} />
        <Stat label="Previews generated" value={c.previews} />
        <Stat label="Emails sent" value={c.emailsSent} />
        <Stat label="Replies" value={c.replies} />
        <Stat label="Interested" value={c.interested} />
        <Stat label="Converted customers" value={c.converted} />
        <Stat label="Reply rate" value={c.emailsSent ? `${Math.round((c.replies / c.emailsSent) * 100)}%` : "—"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Outreach funnel</CardTitle></CardHeader>
          <CardContent><FunnelChart data={a.funnel} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Website status</CardTitle></CardHeader>
          <CardContent><DonutChart data={a.byWebsiteStatus} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leads by category</CardTitle></CardHeader>
          <CardContent><HBarChart data={a.byCategory} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leads by country</CardTitle></CardHeader>
          <CardContent><HBarChart data={a.byCountry} color="var(--chart-2)" /></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Recently updated leads</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {recent.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No leads yet. Create a campaign to start discovery.</p> : null}
          {recent.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/40">
              <span className="flex-1 truncate font-medium">{l.businessName}</span>
              <span className="hidden w-32 truncate text-muted-foreground md:block">{l.city}</span>
              <WebsiteStatusBadge status={l.websiteStatus} />
              <LeadStatusBadge status={l.status} />
              <span className="hidden w-36 text-right text-xs text-muted-foreground lg:block">{formatDate(l.updatedAt)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
