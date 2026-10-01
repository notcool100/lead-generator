"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function NotesEditor({ leadId, initial }: { leadId: string; initial: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = notes !== (initial ?? "");

  async function save() {
    setMsg(null);
    const res = await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    setMsg({ ok: res.ok, text: res.ok ? (data.message ?? "Saved") : (data.error ?? "Could not save") });
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-2">
      <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes, objections, next steps…" maxLength={5000} />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={!dirty || pending} onClick={save}>Save notes</Button>
        {msg ? <span className={msg.ok ? "text-xs text-success" : "text-xs text-destructive"}>{msg.text}</span> : null}
      </div>
    </div>
  );
}
