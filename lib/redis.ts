import IORedis, { type Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared ioredis connection. BullMQ requires maxRetriesPerRequest=null. */
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return globalForRedis.redis;
}
