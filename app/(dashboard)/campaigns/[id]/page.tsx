import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { CallModeSelect } from "@/components/call-mode-select";
import { LeadsTable } from "@/components/leads-table";
import { EmptyState, KV, PageHeader, Stat } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CALL_MARKETS } from "@/lib/call-markets";
import { prisma } from "@/lib/db";
import { formatDate, humanize } from "@/lib/utils";
import { CURSOR_DONE, DISCOVERY_BATCH_SIZE } from "@/services/lead-discovery/discoveryService";

export default async function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const [leads, byStatus, sent, calls, waitingCalls, jobs] = await Promise.all([
    prisma.lead.findMany({
      where: { campaignId: id },
      orderBy: [{ leadScore: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { outreachMessages: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.lead.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } }),
    prisma.outreachMessage.count({ where: { campaignId: id, status: "sent" } }),
    prisma.call.groupBy({ by: ["outcome"], where: { campaignId: id }, _count: { _all: true } }),
    prisma.job.count({ where: { type: "call-place", status: { in: ["queued", "processing"] }, leadId: { in: (await prisma.lead.findMany({ where: { campaignId: id }, select: { id: true } })).map((l) => l.id) } } }),
    prisma.job.groupBy({ by: ["status"], where: { OR: [{ campaignId: id }, { leadId: { in: (await prisma.lead.findMany({ where: { campaignId: id }, select: { id: true } })).map((l) => l.id) } }] }, _count: { _all: true } }),
  ]);
  const exhausted = campaign.discoveryCursor === CURSOR_DONE;
  const count = (s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count._all, 0);
  const jobCount = (s: string) => jobs.find((j) => j.status === s)?._count._all ?? 0;
  const callTotal = calls.reduce((a, c) => a + c._count._all, 0);
  const callsPositive = calls.filter((c) => c.outcome && ["interested", "appointment_booked", "callback_requested"].includes(c.outcome)).reduce((a, c) => a + c._count._all, 0);

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${humanize(campaign.category)} · ${[campaign.city, campaign.region, campaign.country].filter(Boolean).join(", ")}`}
        actions={
          <>
            <StatusBadge status={campaign.status} />
            {campaign.status === "running" ? (
              <>
                <ActionButton variant="outline" endpoint={`/api/campaigns/${id}/pause`}>Pause</ActionButton>
                <ActionButton endpoint={`/api/campaigns/${id}/start`} disabled={exhausted || leads.length >= campaign.maxLeads}>
                  {exhausted ? "Sources exhausted" : leads.length >= campaign.maxLeads ? "Lead limit reached" : `Discover next ${Math.min(DISCOVERY_BATCH_SIZE, campaign.maxLeads - leads.length)}`}
                </ActionButton>
              </>
            ) : (
              <ActionButton endpoint={`/api/campaigns/${id}/start`}>{campaign.status === "draft" ? "Launch" : "Resume"}</ActionButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Leads" value={`${leads.length} / ${campaign.maxLeads}`} />
        <Stat label="Qualified" value={count(["qualified", "analyzing", "analyzed", "preview_generating", "preview_ready", "outreach_draft", "approved", "contacted", "replied", "interested", "not_interested", "converted"])} />
        <Stat label="Rejected" value={count(["rejected"])} />
        <Stat label="Previews ready" value={count(["preview_ready", "outreach_draft", "approved", "contacted", "replied", "interested", "converted"])} />
        <Stat label="Emails sent" value={sent} />
        <Stat label="AI calls" value={callTotal} hint={[callTotal ? `${callsPositive} interested / callback` : campaign.callMode === "off" ? "calling off" : null, waitingCalls ? `${waitingCalls} waiting to be called` : null].filter(Boolean).join(" · ") || undefined} />
        <Stat label="Jobs in flight" value={jobCount("queued") + jobCount("processing")} hint={jobCount("failed") ? `${jobCount("failed")} failed` : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Leads</CardTitle></CardHeader>
          {leads.length ? <LeadsTable leads={leads.map((l) => ({ ...l, outreachStatus: l.outreachMessages[0]?.status ?? null }))} /> : <CardContent><EmptyState title="No leads yet" description={campaign.status === "draft" ? "Launch the campaign to start discovery." : "Discovery is running — refresh in a moment. Make sure the worker process is running (pnpm worker)."} /></CardContent>}
        </Card>
        <Card className="h-fit">
          <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
          <CardContent>
            <dl>
              <KV label="Lead sources">{campaign.leadSources.length ? campaign.leadSources.map(humanize).join(", ") : "Default (LEAD_PROVIDER)"}</KV>
              <KV label="Website criteria">{campaign.targetWebsiteStatuses.map(humanize).join(", ")}</KV>
              <KV label="Min lead score">{campaign.minLeadScore}</KV>
              <KV label="Auto previews">{campaign.autoGeneratePreview ? "Yes" : "No"}</KV>
              <KV label="Auto drafts">{campaign.autoGenerateDrafts ? "Yes" : "No"}</KV>
              <KV label="Auto-send">{campaign.autoSendEnabled ? "Enabled" : "Off (approval)"}</KV>
              <KV label="Daily limit">{campaign.dailyEmailLimit}</KV>
              <KV label="AI calls"><CallModeSelect campaignId={id} value={campaign.callMode} /></KV>
              {campaign.callMode !== "off" ? (
                <>
                  <KV label="Daily call limit">{campaign.dailyCallLimit}</KV>
                  <KV label="Calling rules">{CALL_MARKETS[campaign.callMarket].label}<p className="text-xs text-muted-foreground">{CALL_MARKETS[campaign.callMarket].legalHours}</p></KV>
                  <KV label="Call timezone">{campaign.callTimezone ?? "Settings default"}</KV>
                  <KV label="Voice">{CALL_MARKETS[campaign.callMarket].voices.find((v) => v.id === campaign.callVoiceId)?.label ?? campaign.callVoiceId ?? CALL_MARKETS[campaign.callMarket].voices[0].label}</KV>
                  {CALL_MARKETS[campaign.callMarket].dncRegister ? (
                    <KV label="Do Not Call check">
                      {campaign.dncCheckedAt ? (
                        <span className="grid gap-1">
                          <span className="text-success">Checked {formatDate(campaign.dncCheckedAt)}</span>
                          {leads.some((l) => l.createdAt > campaign.dncCheckedAt!) ? (
                            <>
                              <span className="text-xs text-warning">New leads since then aren&apos;t covered — check them too.</span>
                              <ActionButton size="sm" variant="outline" method="PATCH" endpoint={`/api/campaigns/${id}`} body={{ dncChecked: true }} confirm="Confirm all current numbers were checked against the Do Not Call register?">Mark all as checked</ActionButton>
                            </>
                          ) : null}
                        </span>
                      ) : (
                        <span className="grid gap-1">
                          <span className="text-xs text-warning">Required before calling — check numbers against the {CALL_MARKETS[campaign.callMarket].dncRegister!.name}.</span>
                          <ActionButton size="sm" variant="outline" method="PATCH" endpoint={`/api/campaigns/${id}`} body={{ dncChecked: true }} confirm="Confirm this campaign's numbers were checked against the Do Not Call register and registered numbers removed?">Mark as checked</ActionButton>
                        </span>
                      )}
                    </KV>
                  ) : null}
                </>
              ) : null}
              <KV label="Started">{formatDate(campaign.startedAt)}</KV>
              <KV label="Created">{formatDate(campaign.createdAt)}</KV>
            </dl>
            <Link href={`/leads?campaignId=${id}`} className="mt-3 inline-block text-sm text-primary hover:underline">Open in lead explorer →</Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
