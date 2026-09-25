import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSessionCookie } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { clientIp, errorResponse, HttpError, json, parseBody } from "@/lib/api";
import { getRateLimiter } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const limiter = await getRateLimiter();
    const rl = await limiter.hit(`login:${clientIp(req)}`, 10, 15 * 60_000);
    if (!rl.allowed) throw new HttpError(429, "Too many login attempts. Try again later.");

    const { email, password } = await parseBody(req, Body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      await audit({ action: "auth.login_failed", entityType: "user", metadata: { email: email.toLowerCase() } });
      throw new HttpError(401, "Invalid email or password");
    }
    await createSessionCookie({ sub: user.id, email: user.email, name: user.name, role: user.role });
    await audit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
