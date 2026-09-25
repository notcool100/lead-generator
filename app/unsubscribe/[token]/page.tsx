import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/services/compliance/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage(props: PageProps<"/unsubscribe/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const data = verifyUnsubscribeToken(token);
  const already = data ? await prisma.suppressionEntry.findUnique({ where: { email: data.email } }) : null;
  const done = sp.done === "1" || Boolean(already);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        {!data ? (
          <>
            <h1 className="text-lg font-semibold">Invalid link</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is not valid. Reply to the email with “unsubscribe” and we will remove you.</p>
          </>
        ) : done ? (
          <>
            <h1 className="text-lg font-semibold">You’re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{data.email} will not receive any further emails from us.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Unsubscribe</h1>
            <p className="mt-2 text-sm text-muted-foreground">Stop all future emails to <strong>{data.email}</strong>?</p>
            <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token)}`} className="mt-6">
              <button className="h-9 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
