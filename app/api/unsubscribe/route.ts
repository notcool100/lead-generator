import { type NextRequest } from "next/server";
import { json } from "@/lib/api";
import { suppressEmail } from "@/services/compliance/suppression";
import { verifyUnsubscribeToken } from "@/services/compliance/unsubscribe";

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) and form target. */
export async function POST(req: NextRequest) {
  let token = req.nextUrl.searchParams.get("token");
  if (!token) {
    const form = await req.formData().catch(() => null);
    token = (form?.get("token") as string | null) ?? null;
  }
  const data = token ? verifyUnsubscribeToken(token) : null;
  if (!data) return json({ error: "Invalid unsubscribe link" }, 400);
  await suppressEmail(data.email, "unsubscribed", "unsubscribe_link");
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return Response.redirect(new URL(`/unsubscribe/${token}?done=1`, req.url), 303);
  return json({ ok: true });
}
