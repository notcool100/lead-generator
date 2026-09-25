"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

/** Review → edit → approve / regenerate / reject / suppress. Sending only ever happens after approval. */
export function OutreachEditor({ leadId, message }: { leadId: string; message: { id: string; subject: string; body: string; toEmail: string | null } }) {
  const router = useRouter();
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = subject !== message.subject || body !== message.body;

  async function call(label: string, url: string, init: RequestInit & { confirm?: string } = {}) {
    if (init.confirm && !window.confirm(init.confirm)) return;
    setBusy(label);
    setMsg(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Request failed" });
    setMsg({ ok: true, text: data.message ?? "Done" });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">To: <span className="font-medium text-foreground">{message.toEmail ?? "—"}</span></p>
      <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Body" hint="A compliant footer (sender address + unsubscribe link) is appended automatically when sent.">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-[13px]" />
      </Field>
      {msg ? <p className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!!busy}
          onClick={() => call("approve", `/api/leads/${leadId}/approve-outreach`, { method: "POST", body: JSON.stringify({ messageId: message.id, subject, body }), confirm: "Approve and send this email? It will be sent as soon as sending limits allow." })}
        >
          {busy === "approve" ? "Approving…" : "Approve & Send"}
        </Button>
        <Button variant="outline" disabled={!!busy || !dirty} onClick={() => call("save", `/api/outreach/${message.id}`, { method: "PATCH", body: JSON.stringify({ subject, body }) })}>
          {busy === "save" ? "Saving…" : "Save edits"}
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={() => call("regen", `/api/leads/${leadId}/generate-outreach`, { method: "POST", confirm: dirty ? "Discard your edits and regenerate?" : undefined })}>
          {busy === "regen" ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => call("reject", `/api/outreach/${message.id}/reject`, { method: "POST" })}>Reject</Button>
        <Button variant="ghost" className="text-destructive" disabled={!!busy} onClick={() => call("suppress", `/api/leads/${leadId}/suppress`, { method: "POST", body: JSON.stringify({ reason: "manual" }), confirm: "Suppress this lead? They will never be contacted." })}>
          Suppress
        </Button>
      </div>
    </div>
  );
}
