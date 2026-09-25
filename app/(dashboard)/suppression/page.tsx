import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { getSession, hasRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { SuppressionForm } from "./suppression-form";

export default async function SuppressionPage() {
  const session = await getSession();
  const [entries, campaignEntries, campaigns] = await Promise.all([
    prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.campaignSuppression.findMany({ orderBy: { createdAt: "desc" }, take: 500, include: { campaign: { select: { name: true } } } }),
    prisma.campaign.findMany({ select: { id: true, name: true } }),
  ]);
  const tone = (r: string) => (["unsubscribed", "complaint"].includes(r) ? "red" : r === "bounced" ? "amber" : "neutral");
  return (
    <>
      <PageHeader title="Suppression list" description="Addresses here are never emailed. Unsubscribes, bounces and complaints are added automatically." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Add address</CardTitle></CardHeader>
        <CardContent><SuppressionForm campaigns={campaigns} /></CardContent>
      </Card>
      {entries.length === 0 && campaignEntries.length === 0 ? (
        <EmptyState title="Suppression list is empty" />
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle>Global ({entries.length})</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Email</TH><TH>Reason</TH><TH>Source</TH><TH>Added</TH><TH /></TR></THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-medium">{e.email}</TD>
                    <TD><Badge tone={tone(e.reason)}>{e.reason}</Badge></TD>
                    <TD className="text-muted-foreground">{e.source}</TD>
                    <TD className="text-muted-foreground">{formatDate(e.createdAt)}</TD>
                    <TD className="text-right">
                      {session && hasRole(session, "admin") && !["unsubscribed", "complaint"].includes(e.reason) ? (
                        <ActionButton size="sm" variant="ghost" method="DELETE" endpoint="/api/suppression" body={{ id: e.id }} confirm="Remove from suppression list? Only do this with the recipient's consent.">Remove</ActionButton>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {campaignEntries.length ? (
            <Card>
              <CardHeader><CardTitle>Campaign-level ({campaignEntries.length})</CardTitle></CardHeader>
              <Table>
                <THead><TR><TH>Email</TH><TH>Campaign</TH><TH>Reason</TH><TH>Added</TH></TR></THead>
                <TBody>
                  {campaignEntries.map((e) => (
                    <TR key={e.id}><TD className="font-medium">{e.email}</TD><TD>{e.campaign.name}</TD><TD>{e.reason}</TD><TD className="text-muted-foreground">{formatDate(e.createdAt)}</TD></TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
