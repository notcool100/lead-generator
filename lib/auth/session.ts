import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma, type UserRole } from "@/lib/db";

export const SESSION_COOKIE = "lg_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

function secretKey() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) throw new Error("NEXTAUTH_SECRET is missing or too short");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setAudience("lead-generator")
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "lead-generator" });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the current session (verified against the DB so deleted users lose access). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true } });
  if (!user) return null;
  return { ...session, role: user.role };
}

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasRole(session: SessionPayload, minimum: UserRole): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[minimum];
}
