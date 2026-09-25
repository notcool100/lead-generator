"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Calls a JSON API endpoint and refreshes server components on success. */
export function ActionButton({
  endpoint,
  method = "POST",
  body,
  confirm,
  children,
  successMessage,
  ...props
}: Omit<ButtonProps, "onClick"> & { endpoint: string; method?: string; body?: unknown; confirm?: string; successMessage?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setMsg(null);
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? `Request failed (${res.status})` });
      return;
    }
    setMsg(successMessage || data.message ? { ok: true, text: data.message ?? successMessage! } : null);
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button {...props} disabled={pending || props.disabled} onClick={run}>
        {children}
      </Button>
      {msg ? <span className={msg.ok ? "text-xs text-success" : "text-xs text-destructive"}>{msg.text}</span> : null}
    </span>
  );
}
