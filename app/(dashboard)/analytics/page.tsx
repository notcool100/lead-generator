import { DonutChart, FunnelChart, HBarChart } from "@/components/charts";
import { PageHeader, Stat } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAnalytics } from "@/services/analytics";

export default async function AnalyticsPage() {
  const a = await getAnalytics();
  const ev = a.emailEvents;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return (
    <>
      <PageHeader title="Analytics" description="Funnel, campaign performance and email engagement." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sent" value={ev.sent ?? 0} />
        <Stat label="Delivered" value={ev.delivered ?? 0} hint={pct(ev.delivered ?? 0, ev.sent ?? 0)} />
        <Stat label="Replied" value={ev.replied ?? 0} hint={pct(ev.replied ?? 0, ev.sent ?? 0)} />
        <Stat label="Bounced" value={ev.bounced ?? 0} hint={pct(ev.bounced ?? 0, ev.sent ?? 0)} />
        <Stat label="Unsubscribed / complaints" value={(ev.unsubscribed ?? 0) + (ev.complained ?? 0)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Outreach funnel</CardTitle></CardHeader><CardContent><FunnelChart data={a.funnel} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Website status</CardTitle></CardHeader><CardContent><DonutChart data={a.byWebsiteStatus} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Leads by category</CardTitle></CardHeader><CardContent><HBarChart data={a.byCategory} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Leads by country</CardTitle></CardHeader><CardContent><HBarChart data={a.byCountry} color="var(--chart-2)" /></CardContent></Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Campaign performance</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>Campaign</TH><TH>Leads</TH><TH>Qualified</TH><TH>Sent</TH><TH>Replied</TH><TH>Reply rate</TH><TH>Converted</TH></TR></THead>
          <TBody>
            {a.campaigns.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD className="tabular-nums">{c.leads}</TD>
                <TD className="tabular-nums">{c.qualified}</TD>
                <TD className="tabular-nums">{c.sent}</TD>
                <TD className="tabular-nums">{c.replied}</TD>
                <TD className="tabular-nums">{pct(c.replied, c.sent)}</TD>
                <TD className="tabular-nums">{c.converted}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
