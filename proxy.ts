import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PREFIXES = ["/login", "/p/", "/unsubscribe", "/mock-sites", "/api/auth/login", "/api/webhooks", "/api/unsubscribe", "/api/health"];

/**
 * 1. Rewrites <slug>.<PREVIEW_BASE_DOMAIN> to /p/<slug> so previews work on subdomains.
 * 2. Optimistic auth check (real authorisation happens in every route/page).
 */
export async function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  const base = process.env.PREVIEW_BASE_DOMAIN;
  if (base && host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -(base.length + 1));
    if (/^[a-z0-9-]+$/.test(slug)) {
      const url = req.nextUrl.clone();
      url.pathname = `/p/${slug}`;
      return NextResponse.rewrite(url);
    }
  }

  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("lg_session")?.value;
  let valid = false;
  if (token && process.env.NEXTAUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.NEXTAUTH_SECRET), { audience: "lead-generator" });
      valid = true;
    } catch {
      valid = false;
    }
  }
  if (valid) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
