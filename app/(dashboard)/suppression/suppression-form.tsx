"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export function SuppressionForm({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), reason: fd.get("reason") || "manual", campaignId: fd.get("campaignId") || undefined }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? "" });
    if (res.ok) {
      form.reset();
      router.refresh();
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-2 md:grid-cols-[1fr_200px_220px_auto]">
      <Input name="email" type="email" placeholder="name@business.com" required />
      <Input name="reason" placeholder="Reason (manual)" />
      <Select name="campaignId" defaultValue="">
        <option value="">Global (all campaigns)</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Button type="submit">Suppress</Button>
      {msg ? <p className={`md:col-span-4 text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p> : null}
    </form>
  );
}
