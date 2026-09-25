"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/input";

const OPTIONS = ["qualified", "rejected", "replied", "interested", "not_interested", "converted"];

export function LeadStatusMenu({ leadId, current }: { leadId: string; current: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function change(status: string) {
    if (!status) return;
    const res = await fetch(`/api/leads/${leadId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
    else router.refresh();
  }
  return (
    <span className="inline-flex flex-col">
      <Select className="h-8 w-44 text-xs" value="" onChange={(e) => change(e.target.value)} disabled={current === "suppressed"}>
        <option value="">Set status…</option>
        {OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </Select>
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </span>
  );
}
