import type { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/** Fixed-window limiter backed by Redis (INCR + PEXPIRE). */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis, private readonly prefix = "rl:") {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const bucket = Math.floor(Date.now() / windowMs);
    const k = `${this.prefix}${key}:${bucket}`;
    const count = await this.redis.incr(k);
    if (count === 1) await this.redis.pexpire(k, windowMs);
    const resetMs = (bucket + 1) * windowMs - Date.now();
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetMs };
  }
}

/** In-memory limiter (tests / single-process fallback). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetMs: b.resetAt - t };
  }
}

let limiter: RateLimiter | null = null;

export async function getRateLimiter(): Promise<RateLimiter> {
  if (limiter) return limiter;
  try {
    const { getRedis } = await import("@/lib/redis");
    limiter = new RedisRateLimiter(getRedis());
  } catch {
    limiter = new MemoryRateLimiter();
  }
  return limiter;
}
