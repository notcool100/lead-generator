/**
 * Minimal Apify REST client — https://docs.apify.com/api/v2
 * The token is sent as a Bearer header (never in the URL, so it stays out of logs).
 */
const API = "https://api.apify.com/v2";

export class ApifyError extends Error {
  constructor(message: string, public readonly transient = true) {
    super(message);
  }
}

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

export const TERMINAL_RUN_STATUSES = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

/** Actor ids use "~" instead of "/" in API paths (e.g. compass~crawler-google-places). */
const actorPath = (actorId: string) => encodeURIComponent(actorId.replace("/", "~"));

async function call<T>(token: string, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(init.timeoutMs ?? 90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApifyError(`Apify ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 || res.status === 429 || res.status === 408);
  }
  return (await res.json()) as T;
}

/** Runs an actor and returns its dataset items (Apify caps synchronous runs at 300s). */
export function runActorSync<T>(token: string, actorId: string, input: unknown, timeoutSecs = 120): Promise<T[]> {
  return call<T[]>(token, `/acts/${actorPath(actorId)}/run-sync-get-dataset-items?timeout=${timeoutSecs}`, {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: (timeoutSecs + 30) * 1000,
  });
}

/** Starts an actor run, waiting up to `waitSecs` (max 60) for it to finish. */
export async function startRun(token: string, actorId: string, input: unknown, waitSecs = 60): Promise<ApifyRun> {
  const { data } = await call<{ data: ApifyRun }>(token, `/acts/${actorPath(actorId)}/runs?waitForFinish=${waitSecs}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

/** Returns the run's current state, waiting up to `waitSecs` (max 60) for it to finish. */
export async function getRun(token: string, runId: string, waitSecs = 60): Promise<ApifyRun> {
  const { data } = await call<{ data: ApifyRun }>(token, `/actor-runs/${encodeURIComponent(runId)}?waitForFinish=${waitSecs}`);
  return data;
}

export function datasetItems<T>(token: string, datasetId: string, offset: number, limit: number): Promise<T[]> {
  return call<T[]>(token, `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&offset=${offset}&limit=${limit}`);
}
