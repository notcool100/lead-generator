import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function PreviewsPage() {
  const previews = await prisma.websitePreview.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { lead: { select: { id: true, businessName: true, city: true } }, template: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title="Previews" description="Generated website concepts and their deployments." />
      {previews.length === 0 ? (
        <EmptyState title="No previews yet" description="Previews are generated for qualified, analysed leads." />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Business</TH><TH>Template</TH><TH>Version</TH><TH>Status</TH><TH>Preview URL</TH><TH>Created</TH><TH>Last deployment</TH><TH /></TR></THead>
            <TBody>
              {previews.map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/leads/${p.lead.id}`} className="font-medium hover:underline">{p.lead.businessName}</Link><p className="text-xs text-muted-foreground">{p.lead.city}</p></TD>
                  <TD>{p.template.name}</TD>
                  <TD className="tabular-nums">v{p.version}</TD>
                  <TD><StatusBadge status={p.deploymentStatus} /></TD>
                  <TD className="max-w-64 truncate">{p.deploymentUrl ? <a href={p.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.deploymentUrl.replace(/^https?:\/\//, "")}</a> : "—"}</TD>
                  <TD className="text-muted-foreground">{formatDate(p.createdAt)}</TD>
                  <TD className="text-muted-foreground">{formatDate(p.lastDeployedAt)}</TD>
                  <TD><ActionButton size="sm" variant="outline" endpoint={`/api/previews/${p.id}/deploy`}>Redeploy</ActionButton></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
