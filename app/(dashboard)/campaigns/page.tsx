import Link from "next/link";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDate, humanize } from "@/lib/utils";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Each campaign discovers businesses of one category in one location."
        actions={<Link href="/campaigns/new" className={buttonVariants()}><Plus /> New campaign</Link>}
      />
      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Create a campaign to start discovering leads." action={<Link href="/campaigns/new" className={buttonVariants()}>Create campaign</Link>} />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Name</TH><TH>Category</TH><TH>Location</TH><TH>Status</TH><TH>Leads</TH><TH>Auto-send</TH><TH>Created</TH><TH /></TR></THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.autopilot ? <span className="ml-2 text-xs text-muted-foreground">autopilot</span> : null}</TD>
                  <TD>{humanize(c.category)}</TD>
                  <TD className="text-muted-foreground">{[c.city, c.region, c.country].filter(Boolean).join(", ")}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD className="tabular-nums">{c._count.leads} / {c.maxLeads}</TD>
                  <TD>{c.autoSendEnabled ? <StatusBadge status="approved" /> : <span className="text-muted-foreground">Manual</span>}</TD>
                  <TD className="text-muted-foreground">{formatDate(c.createdAt)}</TD>
                  <TD className="text-right">
                    {c.status === "running" ? (
                      <ActionButton size="sm" variant="outline" endpoint={`/api/campaigns/${c.id}/pause`}>Pause</ActionButton>
                    ) : (
                      <ActionButton size="sm" variant="outline" endpoint={`/api/campaigns/${c.id}/start`}>{c.status === "draft" ? "Launch" : "Resume"}</ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
