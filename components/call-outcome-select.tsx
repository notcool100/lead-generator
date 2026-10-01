"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";
import { humanize } from "@/lib/utils";
import { CALL_OUTCOMES } from "@/prompts/cold-call";

/** Lets a person correct the AI-detected call outcome. */
export function CallOutcomeSelect({ callId, value }: { callId: string; value: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function change(outcome: string) {
    if (outcome === "do_not_contact" && !window.confirm("Mark as do-not-contact? This suppresses the lead for calls and emails.")) return;
    setError(null);
    const res = await fetch(`/api/calls/${callId}/outcome`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not update");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select className="h-7 w-auto py-0 text-xs" value={value ?? ""} disabled={pending} onChange={(e) => change(e.target.value)} aria-label="Call outcome">
        {value ? null : <option value="">Set outcome…</option>}
        {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
      </Select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
