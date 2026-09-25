import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, boolean> = { db: false, redis: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {}
  try {
    checks.redis = (await getRedis().ping()) === "PONG";
  } catch {}
  const ok = Object.values(checks).every(Boolean);
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
