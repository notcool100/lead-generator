"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";

/** Switches a campaign between no calls, the manual Call button, and automatic calling. */
export function CallModeSelect({ campaignId, value }: { campaignId: string; value: "off" | "manual" | "auto" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function change(callMode: string) {
    if (callMode === "auto" && !window.confirm("Leads with a phone number will be called automatically once their preview is ready (within calling hours and limits). Continue?")) return;
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callMode }) });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not update");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select className="h-8 w-auto text-xs" value={value} disabled={pending} onChange={(e) => change(e.target.value)} aria-label="AI calling mode">
        <option value="off">Off</option>
        <option value="manual">Manual (Call button)</option>
        <option value="auto">Automatic</option>
      </Select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
