"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import type { AutopilotSettings, CallingSettings, ComplianceSettings, GeneralSettings, OfferSettings } from "@/services/compliance/settings";

function useSave(key: "compliance" | "general" | "offer" | "calling" | "autopilot") {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function save(value: unknown) {
    setPending(true);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const data = (await res.json()) as { message?: string; error?: string; details?: { path: string[]; message: string }[] };
    setPending(false);
    setMsg({ ok: res.ok, text: res.ok ? (data.message ?? "Saved") : `${data.error}${data.details ? `: ${data.details.map((d) => `${d.path.join(".")} ${d.message}`).join("; ")}` : ""}` });
    if (res.ok) router.refresh();
  }
  return { save, msg, pending };
}

const nums = (s: string) => s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);

export function ComplianceForm({ initial }: { initial: ComplianceSettings }) {
  const [s, setS] = useState(initial);
  const [delays, setDelays] = useState(initial.followupDelayDays.join(", "));
  const [countries, setCountries] = useState(initial.targetCountries.join(", "));
  const { save, msg, pending } = useSave("compliance");
  const set = <K extends keyof ComplianceSettings>(k: K, v: ComplianceSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const num = (k: keyof ComplianceSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...s, followupDelayDays: nums(delays), targetCountries: countries.split(",").map((c) => c.trim()).filter(Boolean) });
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sender identity</legend>
        <Field label="Sender name"><Input value={s.senderName} onChange={(e) => set("senderName", e.target.value)} /></Field>
        <Field label="Sender email" hint="Must be verified with your email provider."><Input type="email" value={s.senderEmail} onChange={(e) => set("senderEmail", e.target.value)} /></Field>
        <Field label="Reply-to"><Input type="email" value={s.replyTo} onChange={(e) => set("replyTo", e.target.value)} /></Field>
        <Field label="Business / legal name"><Input value={s.businessName} onChange={(e) => set("businessName", e.target.value)} /></Field>
        <Field label="Postal address (footer)" className="sm:col-span-2" hint="Required by CAN-SPAM and good practice everywhere."><Input value={s.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} /></Field>
        <Field label="Footer text" className="sm:col-span-2"><Textarea rows={3} value={s.footerText} onChange={(e) => set("footerText", e.target.value)} /></Field>
        <Field label="Unsubscribe mechanism" className="sm:col-span-2">
          <Select value={s.unsubscribeMechanism} onChange={(e) => set("unsubscribeMechanism", e.target.value as ComplianceSettings["unsubscribeMechanism"])}>
            <option value="link_and_header">Link in footer + one-click List-Unsubscribe header (recommended)</option>
            <option value="link_only">Link in footer only</option>
            <option value="reply_only">Reply “unsubscribe” only</option>
          </Select>
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sending limits</legend>
        <Field label="Max emails / day"><Input type="number" min={0} value={s.maxEmailsPerDay} onChange={num("maxEmailsPerDay")} /></Field>
        <Field label="Max emails / hour"><Input type="number" min={0} value={s.maxEmailsPerHour} onChange={num("maxEmailsPerHour")} /></Field>
        <Field label="Max / recipient domain / day"><Input type="number" min={1} value={s.maxEmailsPerDomainPerDay} onChange={num("maxEmailsPerDomainPerDay")} /></Field>
        <Field label="Min delay between emails (s)"><Input type="number" min={0} value={s.minDelaySeconds} onChange={num("minDelaySeconds")} /></Field>
        <Field label="Max follow-ups"><Input type="number" min={0} max={5} value={s.maxFollowups} onChange={num("maxFollowups")} /></Field>
        <Field label="Follow-up days" hint="e.g. 4, 8"><Input value={delays} onChange={(e) => setDelays(e.target.value)} /></Field>
        <Field label="Target countries" className="sm:col-span-3" hint="Comma-separated. Empty = any country. Emails to leads outside this list are blocked."><Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="Portugal, Spain" /></Field>
      </fieldset>
      <Checkbox
        label="Require human approval before sending"
        description="When on (default), no email is ever sent without a person clicking Approve. Campaign auto-send only works when this is off."
        checked={s.requireApproval}
        onChange={(e) => set("requireApproval", e.target.checked)}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save compliance settings"}</Button>
        {msg ? <span className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function GeneralForm({ initial }: { initial: GeneralSettings }) {
  const [s, setS] = useState(initial);
  const { save, msg, pending } = useSave("general");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(s); }}>
      <Checkbox label="Domain discovery" description="For leads with no listed website, try likely domains (DNS + page must mention the business name and city)." checked={s.domainDiscoveryEnabled} onChange={(e) => setS({ ...s, domainDiscoveryEnabled: e.target.checked })} />
      <Field label="Default qualification score"><Input type="number" min={0} max={100} value={s.qualifyMinScore} onChange={(e) => setS({ ...s, qualifyMinScore: Number(e.target.value) })} /></Field>
      <Field label="Email template — subject" hint="Placeholders: {{business_name}} {{category}} {{city}}"><Input value={s.defaultEmailTemplate.subject} onChange={(e) => setS({ ...s, defaultEmailTemplate: { ...s.defaultEmailTemplate, subject: e.target.value } })} /></Field>
      <Field label="Email template — opening line"><Textarea rows={3} value={s.defaultEmailTemplate.intro} onChange={(e) => setS({ ...s, defaultEmailTemplate: { ...s.defaultEmailTemplate, intro: e.target.value } })} /></Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Save</Button>
        {msg ? <span className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function OfferForm({ initial }: { initial: OfferSettings }) {
  const [s, setS] = useState(initial);
  const [includes, setIncludes] = useState(initial.includes.join("\n"));
  const { save, msg, pending } = useSave("offer");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save({ ...s, includes: includes.split("\n").map((x) => x.trim()).filter(Boolean) }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Monthly price"><Input type="number" min={1} step="0.01" value={s.monthlyPrice} onChange={(e) => setS({ ...s, monthlyPrice: Number(e.target.value) })} /></Field>
        <Field label="Currency" hint="ISO code, e.g. USD"><Input value={s.currency} maxLength={8} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} /></Field>
      </div>
      <Field label="Industrial demo site" hint="Sent to construction / industrial companies instead of a per-business preview.">
        <Input type="url" value={s.industrialDemoUrl} onChange={(e) => setS({ ...s, industrialDemoUrl: e.target.value })} />
      </Field>
      <Field label="What the monthly fee includes" hint="One per line. Used in every email and call. No discounts are ever offered automatically.">
        <Textarea rows={5} value={includes} onChange={(e) => setIncludes(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Save offer</Button>
        {msg ? <span className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function AutopilotForm({ initial }: { initial: AutopilotSettings }) {
  const [s, setS] = useState(initial);
  const [countries, setCountries] = useState(initial.allowedCountries.join(", "));
  const [categories, setCategories] = useState(initial.allowedCategories.join(", "));
  const { save, msg, pending } = useSave("autopilot");
  const num = (k: keyof AutopilotSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save({ ...s, allowedCountries: list(countries), allowedCategories: list(categories) }); }}>
      <Checkbox
        label="Autopilot on"
        description="Researches which country and type of business to target, creates the campaign, finds leads, builds the previews and sends the emails with no approval step. Sending limits, unsubscribe links and suppression still apply."
        checked={s.enabled}
        onChange={(e) => setS({ ...s, enabled: e.target.checked })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Leads per campaign"><Input type="number" min={5} max={500} value={s.leadsPerCampaign} onChange={num("leadsPerCampaign")} /></Field>
        <Field label="Emails / day per campaign"><Input type="number" min={1} value={s.dailyEmailLimit} onChange={num("dailyEmailLimit")} /></Field>
        <Field label="New campaign every (hours)" hint="After the last one finishes"><Input type="number" min={1} value={s.newCampaignEveryHours} onChange={num("newCampaignEveryHours")} /></Field>
      </div>
      <Field label="Only these countries" hint="Comma-separated. Leave empty and Autopilot picks wherever the research says demand is."><Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="United States, Australia, United Kingdom" /></Field>
      <Field label="Only these business types" hint="Comma-separated, e.g. construction, restaurant. Leave empty to let Autopilot choose."><Input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="construction" /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Save Autopilot</Button>
        {msg ? <span className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CallingForm({ initial }: { initial: CallingSettings }) {
  const [s, setS] = useState(initial);
  const { save, msg, pending } = useSave("calling");
  const num = (k: keyof CallingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(s); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="AI caller name" hint="It always says it's an AI assistant."><Input value={s.agentName} onChange={(e) => setS({ ...s, agentName: e.target.value })} /></Field>
        <Field label="Default timezone" hint="Used when a campaign has no timezone, e.g. America/Chicago"><Input value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /></Field>
        <Field label="Calls from (hour)"><Input type="number" min={0} max={23} value={s.startHour} onChange={num("startHour")} /></Field>
        <Field label="Calls until (hour)"><Input type="number" min={1} max={24} value={s.endHour} onChange={num("endHour")} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <input type="checkbox" className="accent-[var(--primary)]" checked={s.days.includes(i)} onChange={(e) => setS({ ...s, days: e.target.checked ? [...s.days, i].sort() : s.days.filter((x) => x !== i) })} />
            {d}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Max calls / day (all campaigns)"><Input type="number" min={0} value={s.maxCallsPerDay} onChange={num("maxCallsPerDay")} /></Field>
        <Field label="Max attempts / lead" hint="Automatic calls only"><Input type="number" min={1} max={5} value={s.maxAttemptsPerLead} onChange={num("maxAttemptsPerLead")} /></Field>
        <Field label="Retry after (hours)"><Input type="number" min={1} value={s.retryAfterHours} onChange={num("retryAfterHours")} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Save calling rules</Button>
        {msg ? <span className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await fetch("/api/settings/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setPending(false);
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? "Failed" });
  }
  return (
    <form onSubmit={send} className="grid gap-2">
      <div className="flex gap-2">
        <Input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@gmail.com" />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Send test"}</Button>
      </div>
      {msg ? <p className={msg.ok ? "text-xs text-success" : "text-xs text-destructive"}>{msg.text}</p> : null}
    </form>
  );
}
