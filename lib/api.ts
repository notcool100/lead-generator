import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth/session";
import { getRateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { UserRole } from "@/lib/db";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer) must
 * match this app's host. SameSite=Lax cookies are the first layer; this is the second.
 */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) throw new HttpError(403, "Missing Origin header");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Invalid Origin header");
  }
  if (originHost !== host) throw new HttpError(403, "Cross-origin request rejected");
}

type Ctx<P> = { params: Promise<P> };

interface HandlerOptions {
  role?: UserRole;
  /** requests per minute per user/IP */
  rateLimit?: number;
  public?: boolean;
}

export function apiHandler<P = Record<string, string>>(
  opts: HandlerOptions,
  fn: (args: { req: NextRequest; params: P; session: SessionPayload }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const session = await getSession();
      if (!session) throw new HttpError(401, "Unauthorized");
      if (opts.role && !hasRole(session, opts.role)) throw new HttpError(403, "Forbidden");

      const limiter = await getRateLimiter();
      const rl = await limiter.hit(`api:${session.sub}:${clientIp(req)}`, opts.rateLimit ?? 120, 60_000);
      if (!rl.allowed) throw new HttpError(429, "Too many requests");

      const params = (await ctx.params) as P;
      return await fn({ req, params, session });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.message, details: err.details }, err.status);
  if (err instanceof ZodError) return json({ error: "Validation failed", details: err.issues }, 422);
  logger.error({ err }, "unhandled API error");
  return json({ error: "Internal server error" }, 500);
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  return schema.parse(body);
}

export { clientIp };
