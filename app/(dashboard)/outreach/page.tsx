import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { LeadStatusBadge, StatusBadge, WebsiteStatusBadge } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma, type OutreachStatus } from "@/lib/db";
import { cn, formatDate } from "@/lib/utils";

const TABS: { key: string; label: string; statuses: OutreachStatus[] }[] = [
  { key: "review", label: "Needs review", statuses: ["draft"] },
  { key: "queued", label: "Approved / queued", statuses: ["approved", "queued"] },
  { key: "sent", label: "Sent", statuses: ["sent"] },
  { key: "closed", label: "Rejected / cancelled", statuses: ["rejected", "cancelled", "failed"] },
];

export default async function OutreachPage(props: PageProps<"/outreach">) {
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const [messages, counts] = await Promise.all([
    prisma.outreachMessage.findMany({
      where: { status: { in: tab.statuses } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, businessName: true, websiteStatus: true, status: true } }, events: { select: { eventType: true } } },
    }),
    prisma.outreachMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const n = (s: OutreachStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count._all, 0);

  return (
    <>
      <PageHeader title="Outreach" description="Every email is generated, reviewed by a human, then sent within compliance limits." />
      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={`/outreach?tab=${t.key}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", t.key === tab.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label} <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">{n(t.statuses)}</span>
          </Link>
        ))}
      </div>
      {messages.length === 0 ? (
        <EmptyState title="Nothing here" description={tab.key === "review" ? "Drafts appear here once previews are deployed for leads with an email address." : undefined} />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Business</TH><TH>Subject</TH><TH>To</TH><TH>Website</TH><TH>Lead</TH><TH>Message</TH><TH>Events</TH><TH>Updated</TH><TH /></TR></THead>
            <TBody>
              {messages.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.lead.businessName}</TD>
                  <TD className="max-w-72 truncate">{m.sequenceNumber ? <span className="text-muted-foreground">#{m.sequenceNumber} · </span> : null}{m.subject}</TD>
                  <TD className="max-w-44 truncate text-muted-foreground">{m.toEmail}</TD>
                  <TD><WebsiteStatusBadge status={m.lead.websiteStatus} /></TD>
                  <TD><LeadStatusBadge status={m.lead.status} /></TD>
                  <TD><StatusBadge status={m.status} />{m.error ? <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={m.error}>{m.error}</p> : null}</TD>
                  <TD className="text-xs text-muted-foreground">{[...new Set(m.events.map((e) => e.eventType))].join(", ") || "—"}</TD>
                  <TD className="text-muted-foreground">{formatDate(m.updatedAt)}</TD>
                  <TD><Link href={`/leads/${m.lead.id}`} className={buttonVariants({ size: "sm", variant: m.status === "draft" ? "default" : "outline" })}>{m.status === "draft" ? "Review" : "Open"}</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
