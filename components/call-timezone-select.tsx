"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";

/** Changes the timezone a campaign's calling hours are checked in. */
export function CallTimezoneSelect({ campaignId, value, options }: { campaignId: string; value: string; options: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const all = options.includes(value) ? options : [value, ...options];

  async function change(callTimezone: string) {
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callTimezone }) });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not update");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select className="h-8 w-auto text-xs" value={value} disabled={pending} onChange={(e) => change(e.target.value)} aria-label="Call timezone">
        {all.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
      </Select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
