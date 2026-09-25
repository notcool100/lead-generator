import Link from "next/link";
import { LeadsTable } from "@/components/leads-table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { prisma, type Prisma } from "@/lib/db";
import { humanize } from "@/lib/utils";
import { LeadListQuerySchema } from "@/lib/validation";

const LEAD_STATUSES = ["discovered", "qualified", "rejected", "analyzing", "analyzed", "preview_generating", "preview_ready", "outreach_draft", "approved", "contacted", "replied", "interested", "not_interested", "converted", "suppressed"];
const WEBSITE_STATUSES = ["unknown", "no_website", "poor_website", "outdated", "good_website", "excellent_website", "unreachable"];

export default async function LeadsPage(props: PageProps<"/leads">) {
  const raw = await props.searchParams;
  const parsed = LeadListQuerySchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v !== "")));
  const q = parsed.success ? parsed.data : LeadListQuerySchema.parse({});

  const where: Prisma.LeadWhereInput = {
    ...(q.q ? { OR: [{ businessName: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { city: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.status && LEAD_STATUSES.includes(q.status) ? { status: q.status as Prisma.LeadWhereInput["status"] } : {}),
    ...(q.websiteStatus ? { websiteStatus: q.websiteStatus } : {}),
    ...(q.campaignId ? { campaignId: q.campaignId } : {}),
    ...(q.country ? { country: { equals: q.country, mode: "insensitive" } } : {}),
    ...(q.category ? { category: { equals: q.category, mode: "insensitive" } } : {}),
  };
  const [leads, total, campaigns] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: [{ leadScore: "desc" }, { createdAt: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.lead.count({ where }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / q.pageSize));
  const pageHref = (p: number) => `/leads?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([k, v]) => v != null && k !== "page").map(([k, v]) => [k, String(v)])), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Leads" description={`${total} lead${total === 1 ? "" : "s"} match your filters.`} />
      <form className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_180px_200px_auto]">
        <Input name="q" placeholder="Search name, email, city…" defaultValue={q.q} />
        <Select name="status" defaultValue={q.status ?? ""}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
        <Select name="websiteStatus" defaultValue={q.websiteStatus ?? ""}>
          <option value="">Any website</option>
          {WEBSITE_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
        <Select name="campaignId" defaultValue={q.campaignId ?? ""}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          <Link href="/leads" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
        </div>
      </form>
      {leads.length === 0 ? (
        <EmptyState title="No leads found" description="Adjust filters or launch a campaign." />
      ) : (
        <Card>
          <LeadsTable leads={leads} />
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Page {q.page} of {pages}</span>
            <div className="flex gap-2">
              {q.page > 1 ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={pageHref(q.page - 1)}>Previous</Link> : null}
              {q.page < pages ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={pageHref(q.page + 1)}>Next</Link> : null}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
