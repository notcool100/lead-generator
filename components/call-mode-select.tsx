"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";

/** Switches a campaign between no calls, the manual Call button, and automatic calling. */
export function CallModeSelect({ campaignId, value }: { campaignId: string; value: "off" | "manual" | "auto" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function change(callMode: string) {
    if (
      callMode === "auto" &&
      !window.confirm("Every ready lead (phone number + live preview, not called yet) will be queued now, and new leads once their preview is ready. Calls only go out during calling hours. Continue?")
    )
      return;
    setMsg(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callMode }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Could not update" });
      return;
    }
    if (data.message) setMsg({ ok: true, text: data.message });
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select className="h-8 w-auto text-xs" value={value} disabled={pending} onChange={(e) => change(e.target.value)} aria-label="AI calling mode">
        <option value="off">Off</option>
        <option value="manual">Manual (Call button)</option>
        <option value="auto">Automatic</option>
      </Select>
      {msg ? <span className={msg.ok ? "text-xs text-success" : "text-xs text-destructive"}>{msg.text}</span> : null}
    </span>
  );
}
