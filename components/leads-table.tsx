import Link from "next/link";
import { LeadStatusBadge, ScorePill, WebsiteStatusBadge } from "@/components/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { humanize } from "@/lib/utils";

export interface LeadRow {
  id: string;
  businessName: string;
  category: string;
  city: string | null;
  country: string;
  email: string | null;
  websiteStatus: string;
  leadScore: number;
  status: string;
  doNotContact: boolean;
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  return (
    <Table>
      <THead>
        <TR><TH>Business</TH><TH>Category</TH><TH>Location</TH><TH>Website</TH><TH>Score</TH><TH>Status</TH><TH>Email</TH></TR>
      </THead>
      <TBody>
        {leads.map((l) => (
          <TR key={l.id}>
            <TD><Link className="font-medium hover:underline" href={`/leads/${l.id}`}>{l.businessName}</Link></TD>
            <TD>{humanize(l.category)}</TD>
            <TD className="text-muted-foreground">{[l.city, l.country].filter(Boolean).join(", ")}</TD>
            <TD><WebsiteStatusBadge status={l.websiteStatus} /></TD>
            <TD><ScorePill score={l.leadScore} /></TD>
            <TD><LeadStatusBadge status={l.status} /></TD>
            <TD className="max-w-48 truncate text-muted-foreground">{l.doNotContact ? <span className="text-destructive">do not contact</span> : (l.email ?? "—")}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
