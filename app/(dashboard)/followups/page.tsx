import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/services/compliance/settings";

export default async function FollowupsPage() {
  const [followups, settings] = await Promise.all([
    prisma.followup.findMany({ orderBy: { scheduledAt: "asc" }, take: 300, include: { lead: { select: { id: true, businessName: true, status: true } } } }),
    getSettings("compliance"),
  ]);
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={`Sequence: initial email, then follow-ups on day ${settings.followupDelayDays.slice(0, settings.maxFollowups).join(" and ") || "—"} (max ${settings.maxFollowups}). Stops on reply, unsubscribe, bounce, complaint or do-not-contact.`}
      />
      {followups.length === 0 ? (
        <EmptyState title="No follow-ups scheduled" description="Follow-ups are scheduled automatically after an email is sent." />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Business</TH><TH>Step</TH><TH>Scheduled</TH><TH>Status</TH><TH>Reason</TH></TR></THead>
            <TBody>
              {followups.map((f) => (
                <TR key={f.id}>
                  <TD><Link href={`/leads/${f.lead.id}`} className="font-medium hover:underline">{f.lead.businessName}</Link></TD>
                  <TD>Follow-up #{f.sequenceNumber}</TD>
                  <TD className="text-muted-foreground">{formatDate(f.scheduledAt)}</TD>
                  <TD><StatusBadge status={f.status} /></TD>
                  <TD className="text-muted-foreground">{f.reason ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
