import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { LeadStatusMenu } from "@/components/lead-status-menu";
import { OutreachEditor } from "@/components/outreach-editor";
import { KV, PageHeader } from "@/components/page-header";
import { LeadStatusBadge, ScorePill, StatusBadge, WebsiteStatusBadge } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate, humanize } from "@/lib/utils";

function Flag({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <span className={value == null ? "text-muted-foreground" : value ? "text-success" : "text-destructive"}>{value == null ? "—" : value ? "Yes" : "No"}</span>
    </div>
  );
}

const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export default async function LeadPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      websiteChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      previews: { include: { template: true }, orderBy: { updatedAt: "desc" } },
      outreachMessages: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { occurredAt: "desc" } }, approvedBy: { select: { name: true } } } },
      followups: { orderBy: { scheduledAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!lead) notFound();

  const check = lead.websiteChecks[0];
  const meta = (check?.metadata ?? {}) as { outdatedSignals?: string[]; band?: string; title?: string };
  const analysis = lead.analyses[0];
  const preview = lead.previews[0];
  const draft = lead.outreachMessages.find((m) => m.status === "draft");
  const social = (lead.socialLinks as Record<string, string> | null) ?? {};

  const technical = lead.websiteStatusReasons.filter((r) => /https|ssl|response|redirect|mixed|flash|viewport|http \d|reached|server error/i.test(r));
  const ux = lead.websiteStatusReasons.filter((r) => !technical.includes(r));
  const missing = check
    ? ([
        [check.hasContactInformation, "Contact information"],
        [check.hasClearCta, "Clear call-to-action"],
        [check.hasBooking, "Online booking"],
        [check.hasMenu, "Menu / services page"],
        [check.hasSocialLinks, "Social links"],
        [check.mobileFriendly, "Mobile-friendly layout"],
      ] as const).filter(([v]) => v === false).map(([, l]) => l)
    : [];

  return (
    <>
      <PageHeader
        title={lead.businessName}
        description={`${humanize(lead.category)} · ${[lead.city, lead.region, lead.country].filter(Boolean).join(", ")}${lead.campaign ? ` · ${lead.campaign.name}` : ""}`}
        actions={
          <>
            <LeadStatusBadge status={lead.status} />
            <LeadStatusMenu leadId={lead.id} current={lead.status} />
            {!lead.doNotContact ? (
              <ActionButton variant="outline" size="sm" className="text-destructive" endpoint={`/api/leads/${lead.id}/suppress`} body={{ reason: "manual" }} confirm="Suppress this lead permanently?">Suppress</ActionButton>
            ) : null}
          </>
        }
      />

      {lead.doNotContact ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Do not contact{lead.unsubscribed ? " — this recipient unsubscribed" : ""}. No emails or follow-ups will be sent.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Business</CardTitle></CardHeader>
          <CardContent>
            <dl>
              <KV label="Category">{humanize(lead.category)}</KV>
              <KV label="Address">{lead.address}</KV>
              <KV label="Phone">{lead.phone}</KV>
              <KV label="Email">{lead.email}</KV>
              <KV label="Website">{lead.websiteUrl ? <a className="text-primary hover:underline" href={lead.websiteUrl} target="_blank" rel="noopener noreferrer">{lead.websiteUrl.replace(/^https?:\/\//, "").slice(0, 48)}</a> : null}</KV>
              <KV label="Rating">{lead.rating ? `${lead.rating.toFixed(1)} ★` : null}</KV>
              <KV label="Reviews">{lead.reviewCount}</KV>
              <KV label="Social">{Object.keys(social).length ? Object.entries(social).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="mr-2 capitalize text-primary hover:underline">{k}</a>) : null}</KV>
              <KV label="Lead score"><ScorePill score={lead.leadScore} /></KV>
              <KV label="Found via">{(lead.sources.length ? lead.sources : [lead.source]).map(humanize).join(", ")}</KV>
              <KV label="Source page">
                {lead.sourceUrl ? <a className="text-primary hover:underline" href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(lead.sourceUrl).hostname.replace(/^www\./, "")}</a> : null}
                {lead.sourceVerified === false ? <span className="ml-2 text-xs text-warning">unverified — check before contacting</span> : lead.sourceVerified ? <span className="ml-2 text-xs text-success">verified</span> : null}
              </KV>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1">
              <CardTitle>Website analysis</CardTitle>
              <CardDescription>{check ? `Checked ${formatDate(check.checkedAt)}` : "Not checked yet"}</CardDescription>
            </div>
            <ActionButton size="sm" variant="outline" endpoint={`/api/leads/${lead.id}/check-website`}>Re-check</ActionButton>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <WebsiteStatusBadge status={lead.websiteStatus} />
              {check?.overallScore != null ? <ScorePill score={check.overallScore} /> : null}
              {meta.band ? <span className="text-xs text-muted-foreground">{humanize(meta.band)}</span> : null}
            </div>
            {check?.overallScore != null ? (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {[["Technical", check.technicalScore], ["Content", check.contentScore], ["Design", check.designScore]].map(([l, v]) => (
                  <div key={l as string} className="rounded-md bg-muted px-2 py-2"><p className="text-muted-foreground">{l}</p><p className="mt-0.5 text-base font-semibold tabular-nums">{v ?? "—"}</p></div>
                ))}
              </div>
            ) : null}
            {technical.length ? <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Technical issues</p><ul className="list-disc space-y-0.5 pl-4 text-sm">{technical.map((r) => <li key={r}>{r}</li>)}</ul></div> : null}
            {ux.length ? <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">UX / content issues</p><ul className="list-disc space-y-0.5 pl-4 text-sm">{ux.map((r) => <li key={r}>{r}</li>)}</ul></div> : null}
            {missing.length ? <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Missing features</p><p className="text-sm">{missing.join(" · ")}</p></div> : null}
            {check?.reachable ? (
              <div className="grid grid-cols-2 gap-2">
                <Flag label="HTTPS" value={check.sslValid} />
                <Flag label="Mobile" value={check.mobileFriendly} />
                <Flag label="Contact info" value={check.hasContactInformation} />
                <Flag label="Clear CTA" value={check.hasClearCta} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1">
              <CardTitle>AI analysis</CardTitle>
              <CardDescription>{analysis ? `${analysis.model} · confidence ${Math.round(analysis.confidence * 100)}%` : "Not analysed yet"}</CardDescription>
            </div>
            <ActionButton size="sm" variant="outline" endpoint={`/api/leads/${lead.id}/analyze`} disabled={lead.websiteStatus === "unknown"}>{analysis ? "Re-analyse" : "Analyse"}</ActionButton>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {analysis ? (
              <>
                <p>{analysis.summary}</p>
                <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Opportunity</p><p>{analysis.websiteOpportunity}</p></div>
                {asList(analysis.strengths).length ? <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Strengths</p><ul className="list-disc pl-4">{asList(analysis.strengths).map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
                <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Recommendations</p><ul className="list-disc pl-4">{asList(analysis.recommendedFeatures).map((s) => <li key={s}>{s}</li>)}</ul></div>
                {analysis.targetAudience ? <p className="text-muted-foreground">Audience: {analysis.targetAudience}</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">Qualified leads are analysed automatically. Analysis uses only verified data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1">
              <CardTitle>Website preview</CardTitle>
              <CardDescription>
                {preview ? <>{preview.template.name} template · v{preview.version} · {preview.deploymentProvider} · last deployed {formatDate(preview.lastDeployedAt)}</> : "No preview yet"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {preview ? <StatusBadge status={preview.deploymentStatus} /> : null}
              <ActionButton size="sm" variant="outline" endpoint={`/api/leads/${lead.id}/generate-preview`} disabled={lead.doNotContact}>{preview ? "Regenerate" : "Generate"}</ActionButton>
              {preview ? <ActionButton size="sm" variant="outline" endpoint={`/api/previews/${preview.id}/deploy`}>Deploy</ActionButton> : null}
              {preview?.deploymentUrl ? <a href={preview.deploymentUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}><ExternalLink /> Open</a> : null}
            </div>
          </CardHeader>
          <CardContent>
            {preview?.deploymentStatus === "deployed" ? (
              <div className="overflow-hidden rounded-lg border bg-muted">
                <div className="flex items-center gap-1.5 border-b bg-card px-3 py-2">
                  <span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 truncate text-xs text-muted-foreground">{preview.deploymentUrl}</span>
                </div>
                <iframe src={`/p/${preview.subdomain}`} title="Website preview" className="h-[560px] w-full bg-white" sandbox="allow-popups" loading="lazy" />
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{preview ? `Deployment ${preview.deploymentStatus}…` : "Generate a preview once the lead is analysed."}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div className="grid gap-1"><CardTitle>Outreach</CardTitle><CardDescription>Generate → human review → send</CardDescription></div>
              {!draft && !lead.doNotContact ? <ActionButton size="sm" variant="outline" endpoint={`/api/leads/${lead.id}/generate-outreach`} disabled={!preview?.deploymentUrl || !lead.email}>Generate draft</ActionButton> : null}
            </CardHeader>
            <CardContent>
              {draft && !lead.doNotContact ? (
                <OutreachEditor leadId={lead.id} message={{ id: draft.id, subject: draft.subject, body: draft.body, toEmail: draft.toEmail }} />
              ) : (
                <p className="text-sm text-muted-foreground">{!lead.email ? "No email address for this lead — outreach by email is not possible." : !preview?.deploymentUrl ? "A deployed preview is required before drafting." : "No pending draft."}</p>
              )}
            </CardContent>
          </Card>
          {lead.outreachMessages.filter((m) => m.status !== "draft").length ? (
            <Card>
              <CardHeader><CardTitle>Message history</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                {lead.outreachMessages.filter((m) => m.status !== "draft").map((m) => (
                  <div key={m.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{m.sequenceNumber ? `Follow-up #${m.sequenceNumber}: ` : ""}{m.subject}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.sentAt ? `Sent ${formatDate(m.sentAt)}` : m.approvedAt ? `Approved ${formatDate(m.approvedAt)}${m.approvedBy ? ` by ${m.approvedBy.name}` : ""}` : formatDate(m.createdAt)}
                      {m.error ? ` · ${m.error}` : ""}
                    </p>
                    {m.events.length ? <div className="mt-2 flex flex-wrap gap-1">{m.events.map((e) => <StatusBadge key={e.id} status={e.eventType} />)}</div> : null}
                  </div>
                ))}
                {lead.followups.length ? (
                  <div className="text-sm">
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Follow-ups</p>
                    {lead.followups.map((f) => <p key={f.id} className="flex justify-between"><span>#{f.sequenceNumber} · {formatDate(f.scheduledAt)}</span><StatusBadge status={f.status} /></p>)}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative ml-2 border-l pl-5">
            {lead.events.map((e) => (
              <li key={e.id} className="mb-4 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-card bg-primary" />
                <p className="text-sm">{e.message}</p>
                <p className="text-xs text-muted-foreground">{humanize(e.type)} · {formatDate(e.createdAt)}</p>
              </li>
            ))}
          </ol>
          {lead.events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">Created {formatDate(lead.createdAt)} · <Link href="/leads" className="hover:underline">Back to leads</Link></p>
    </>
  );
}
