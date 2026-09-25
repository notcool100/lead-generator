import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, hasRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/services/compliance/settings";
import { LEAD_SOURCES, sourceAvailability } from "@/providers/leads";
import { ComplianceForm, GeneralForm, TestEmailForm } from "./settings-forms";
import { imapConfigured } from "@/services/email/inboxSync";

function ProviderRow({ name, value, ok, note }: { name: string; value: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{name}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs">{value}</span>
        <Badge tone={ok ? "green" : "amber"}>{ok ? "ready" : (note ?? "missing key")}</Badge>
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/");
  const e = env();
  const inboxRow = await prisma.setting.findUnique({ where: { key: "imap_sync" } });
  const inboxState = inboxRow?.value as { lastSyncAt?: string } | undefined;
  const [compliance, general, audits] = await Promise.all([
    getSettings("compliance"),
    getSettings("general"),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { user: { select: { name: true } } } }),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Secrets live in environment variables and are never sent to the browser." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Outreach compliance</CardTitle>
            <CardDescription>Sender identity, footer, unsubscribe mechanism, sending limits and approval.</CardDescription>
          </CardHeader>
          <CardContent><ComplianceForm initial={compliance} /></CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader><CardTitle>Providers</CardTitle><CardDescription>Set via environment variables (see .env.example).</CardDescription></CardHeader>
            <CardContent>
              <ProviderRow name="AI provider" value={e.AI_PROVIDER === "claude_code" ? "claude_code (subscription)" : e.AI_PROVIDER} ok={e.AI_PROVIDER === "anthropic" ? Boolean(e.ANTHROPIC_API_KEY) : e.AI_PROVIDER === "openai" ? Boolean(e.OPENAI_API_KEY) : true} />
              <ProviderRow name="AI model (analysis & copy)" value={e.AI_PROVIDER === "claude_code" ? e.CLAUDE_CODE_MODEL : e.AI_MODEL} ok />
              <ProviderRow name="AI model (classification)" value={e.AI_PROVIDER === "claude_code" ? e.CLAUDE_CODE_SMALL_MODEL : e.AI_SMALL_MODEL} ok />
              {LEAD_SOURCES.map((src) => {
                const a = sourceAvailability(src.key);
                return <ProviderRow key={src.key} name={`Lead source: ${src.label}`} value={e.LEAD_PROVIDER.includes(src.key) ? "default" : "optional"} ok={a.ok} note={a.reason} />;
              })}
              <ProviderRow name="Email provider" value={e.EMAIL_PROVIDER === "smtp" ? `smtp · ${e.SMTP_USER ?? ""}` : e.EMAIL_PROVIDER} ok={e.EMAIL_PROVIDER === "log" || e.EMAIL_PROVIDER === "ses" || (e.EMAIL_PROVIDER === "smtp" ? Boolean(e.SMTP_HOST && e.SMTP_PASSWORD) : Boolean(e.EMAIL_API_KEY))} />
              <ProviderRow name="Inbox sync (replies & bounces)" value={imapConfigured() ? `IMAP · ${e.IMAP_USER} · every 2 min${inboxState?.lastSyncAt ? ` · last ${formatDate(inboxState.lastSyncAt)}` : ""}` : "off"} ok={imapConfigured()} note="IMAP_* not set" />
              <ProviderRow name="Webhook secret" value="EMAIL_WEBHOOK_SECRET" ok={Boolean(e.EMAIL_WEBHOOK_SECRET)} />
              <ProviderRow name="Preview deployment" value={`${e.DEPLOYMENT_PROVIDER}${e.PREVIEW_BASE_DOMAIN ? ` · *.${e.PREVIEW_BASE_DOMAIN}` : " · /p/<slug>"}`} ok={e.DEPLOYMENT_PROVIDER !== "vercel" || Boolean(e.DEPLOYMENT_API_KEY)} />
              <ProviderRow name="Redis" value={e.REDIS_URL.replace(/\/\/[^@]*@/, "//***@")} ok />
              <ProviderRow name="Stock images" value="Unsplash" ok={Boolean(e.UNSPLASH_ACCESS_KEY)} />
              {e.AI_PROVIDER === "claude_code" ? <p className="mt-3 text-xs text-muted-foreground">Claude runs through the logged-in Claude Code CLI on this machine (your subscription, subject to its usage limits).</p> : null}
              {(e.AI_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) ? <p className="mt-3 text-xs text-warning">No ANTHROPIC_API_KEY set — the offline fact-only generator is used instead of Claude.</p> : null}
              {e.EMAIL_PROVIDER === "log" ? <p className="mt-2 text-xs text-warning">EMAIL_PROVIDER=log — approved emails are logged, not delivered.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Send a test email</CardTitle><CardDescription>Sends one message to you through the configured provider.</CardDescription></CardHeader>
            <CardContent><TestEmailForm defaultTo={session.email.endsWith("@example.com") ? "" : session.email} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
            <CardContent><GeneralForm initial={general} /></CardContent>
          </Card>
        </div>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Recent audit log</CardTitle></CardHeader>
        <CardContent className="divide-y text-sm">
          {audits.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <span className="font-mono text-xs">{a.action}</span>
              <span className="text-muted-foreground">{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 36)}` : ""}</span>
              <span className="ml-auto text-xs text-muted-foreground">{a.user?.name ?? "system"} · {formatDate(a.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
