import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Thin Retell AI REST client (no SDK dependency). Retell runs the live
 * conversation; the caller ID is a Twilio number imported into Retell.
 * Docs: https://docs.retellai.com/api-references/create-phone-call
 */
const BASE = "https://api.retellai.com";

export class RetellError extends Error {
  constructor(message: string, public status: number, public transient: boolean) {
    super(message);
  }
}

export interface RetellCall {
  call_id: string;
  call_status: "registered" | "not_connected" | "ongoing" | "ended" | "error";
  from_number?: string;
  to_number?: string;
  agent_id?: string;
  metadata?: Record<string, unknown> | null;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: unknown;
  recording_url?: string;
  disconnection_reason?: string;
  telephony_identifier?: { twilio_call_sid?: string } | null;
  call_analysis?: {
    call_summary?: string;
    in_voicemail?: boolean;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown> | null;
  } | null;
  call_cost?: { combined_cost?: number } | null;
}

export interface RetellWebhookEvent {
  event: "call_started" | "call_ended" | "call_analyzed" | string;
  call: RetellCall;
}

export class RetellClient {
  constructor(private apiKey: string) {}

  async request<T>(path: string, body: unknown, method = "POST"): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new RetellError(`Retell request failed: ${err instanceof Error ? err.message : String(err)}`, 0, true);
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { message?: string; error_message?: string };
        msg = j.message ?? j.error_message ?? msg;
      } catch {
        /* keep raw text */
      }
      throw new RetellError(`Retell ${res.status}: ${msg}`, res.status, res.status === 429 || res.status >= 500);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  createPhoneCall(params: {
    fromNumber: string;
    toNumber: string;
    agentId?: string;
    metadata?: Record<string, string>;
    dynamicVariables?: Record<string, string>;
    /** Per-call voice / speech-recognition language (overrides the agent's). */
    voiceId?: string;
    language?: string;
  }) {
    const agent = { ...(params.voiceId ? { voice_id: params.voiceId } : {}), ...(params.language ? { language: params.language } : {}) };
    return this.request<RetellCall>("/v2/create-phone-call", {
      from_number: params.fromNumber,
      to_number: params.toNumber,
      ...(params.agentId ? { override_agent_id: params.agentId } : {}),
      metadata: params.metadata,
      retell_llm_dynamic_variables: params.dynamicVariables,
      ...(Object.keys(agent).length ? { agent_override: { agent } } : {}),
    });
  }
}

/**
 * Verifies the `x-retell-signature` header ("v=<ms timestamp>,d=<hex HMAC-SHA256(body + timestamp, apiKey)>"),
 * matching Retell's SDK. Rejects signatures older than 5 minutes.
 */
export function verifyRetellSignature(rawBody: string, signature: string | null, apiKey: string, now = Date.now()): boolean {
  if (!signature) return false;
  const m = /^v=(\d+),d=([0-9a-f]{64})$/i.exec(signature.trim());
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > 5 * 60_000) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody + m[1]).digest();
  const given = Buffer.from(m[2], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Test helper / local tooling: produces a valid signature for a body. */
export function signRetellBody(rawBody: string, apiKey: string, ts = Date.now()) {
  return `v=${ts},d=${createHmac("sha256", apiKey).update(rawBody + ts).digest("hex")}`;
}
