import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * HTTP fetch hardened for untrusted, user/provider-supplied URLs:
 *  - only http/https
 *  - blocks private / loopback / link-local targets (SSRF) unless explicitly allowed
 *  - manual redirect following with re-validation on every hop
 *  - timeout and response size cap
 */
export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirects: string[];
  headers: Headers;
  body: string;
  responseTimeMs: number;
}

export class FetchBlockedError extends Error {}

const MAX_BYTES = 2_000_000;
const USER_AGENT = "LeadGeneratorBot/1.0 (+website-quality-check; respects robots)";

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

function allowPrivate() {
  return process.env.ALLOW_PRIVATE_NETWORK_FETCH === "true" || process.env.NODE_ENV !== "production";
}

export async function assertPublicHost(hostname: string) {
  if (allowPrivate()) return;
  const addrs = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlockedError(`Blocked private address for ${hostname}`);
}

export async function safeFetch(url: string, opts: { timeoutMs?: number; maxRedirects?: number; method?: "GET" | "HEAD" } = {}): Promise<SafeFetchResult> {
  const started = Date.now();
  const redirects: string[] = [];
  let current = url;
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 12_000);

  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const u = new URL(current);
    if (!["http:", "https:"].includes(u.protocol)) throw new FetchBlockedError(`Unsupported protocol ${u.protocol}`);
    await assertPublicHost(u.hostname);

    const res = await fetch(current, {
      method: opts.method ?? "GET",
      redirect: "manual",
      signal: deadline,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      redirects.push(current);
      continue;
    }

    let body = "";
    if (opts.method !== "HEAD" && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        body += decoder.decode(value, { stream: true });
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
    return { ok: res.ok, status: res.status, finalUrl: current, redirects, headers: res.headers, body, responseTimeMs: Date.now() - started };
  }
  throw new Error("Too many redirects");
}
