import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma, type JobStatus } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function JobsPage(props: PageProps<"/jobs">) {
  const sp = await props.searchParams;
  const status = (["queued", "processing", "completed", "failed"] as JobStatus[]).find((s) => s === sp.status);
  const [jobs, counts, byType] = await Promise.all([
    prisma.job.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.job.groupBy({ by: ["type", "status"], _count: { _all: true }, _avg: { durationMs: true } }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const types = [...new Set(byType.map((b) => b.type))].sort();

  return (
    <>
      <PageHeader title="System jobs" description="Background work processed by the worker service (BullMQ + Redis). Transient failures retry with exponential backoff." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {["queued", "processing", "completed", "failed"].map((s) => (
          <Link key={s} href={status === s ? "/jobs" : `/jobs?status=${s}`}><Stat label={s.charAt(0).toUpperCase() + s.slice(1)} value={n(s)} hint={status === s ? "filter active" : undefined} /></Link>
        ))}
      </div>
      <Card className="mt-4">
        <Table>
          <THead><TR><TH>Queue</TH><TH>Completed</TH><TH>Failed</TH><TH>In flight</TH><TH>Avg duration</TH></TR></THead>
          <TBody>
            {types.map((t) => {
              const row = (s: string) => byType.find((b) => b.type === t && b.status === s);
              return (
                <TR key={t}>
                  <TD className="font-mono text-xs">{t}</TD>
                  <TD className="tabular-nums">{row("completed")?._count._all ?? 0}</TD>
                  <TD className="tabular-nums">{row("failed")?._count._all ?? 0}</TD>
                  <TD className="tabular-nums">{(row("queued")?._count._all ?? 0) + (row("processing")?._count._all ?? 0)}</TD>
                  <TD className="tabular-nums">{row("completed")?._avg.durationMs ? `${Math.round(row("completed")!._avg.durationMs!)} ms` : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      {jobs.length === 0 ? (
        <div className="mt-4"><EmptyState title="No jobs" /></div>
      ) : (
        <Card className="mt-4">
          <Table>
            <THead><TR><TH>Type</TH><TH>Status</TH><TH>Attempts</TH><TH>Lead / campaign</TH><TH>Duration</TH><TH>Created</TH><TH>Error</TH><TH /></TR></THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id}>
                  <TD className="font-mono text-xs">{j.type}</TD>
                  <TD><StatusBadge status={j.status} /></TD>
                  <TD className="tabular-nums">{j.attempts}</TD>
                  <TD className="text-xs">
                    {j.leadId ? <Link className="text-primary hover:underline" href={`/leads/${j.leadId}`}>lead</Link> : null}
                    {j.campaignId ? <Link className="ml-2 text-primary hover:underline" href={`/campaigns/${j.campaignId}`}>campaign</Link> : null}
                  </TD>
                  <TD className="tabular-nums text-muted-foreground">{j.durationMs != null ? `${j.durationMs} ms` : "—"}</TD>
                  <TD className="text-muted-foreground">{formatDate(j.createdAt)}</TD>
                  <TD className="max-w-80 truncate text-xs text-destructive" title={j.error ?? undefined}>{j.error}</TD>
                  <TD>{j.status === "failed" ? <ActionButton size="sm" variant="outline" endpoint="/api/jobs/retry" body={{ jobId: j.id }}>Retry</ActionButton> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
