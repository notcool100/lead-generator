import Link from "next/link";
import { LeadStatusBadge, ScorePill, StatusBadge, WebsiteStatusBadge } from "@/components/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { humanize } from "@/lib/utils";

export interface LeadRow {
  id: string;
  businessName: string;
  category: string;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  websiteStatus: string;
  leadScore: number;
  status: string;
  doNotContact: boolean;
  lastCallOutcome: string | null;
  /** Status of the latest outreach email, if any. */
  outreachStatus?: string | null;
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  return (
    <Table>
      <THead>
        <TR><TH>Business</TH><TH>Location</TH><TH>Contact</TH><TH>Website</TH><TH>Score</TH><TH>Status</TH><TH>Email</TH><TH>Call</TH></TR>
      </THead>
      <TBody>
        {leads.map((l) => (
          <TR key={l.id}>
            <TD>
              <Link className="font-medium hover:underline" href={`/leads/${l.id}`}>{l.businessName}</Link>
              <p className="text-xs text-muted-foreground">{humanize(l.category)}</p>
            </TD>
            <TD className="text-muted-foreground">{[l.city, l.country].filter(Boolean).join(", ")}</TD>
            <TD className="max-w-48 text-xs text-muted-foreground">
              {l.doNotContact ? (
                <span className="text-destructive">do not contact</span>
              ) : (
                <>
                  <p className="truncate">{l.phone ?? "no phone"}</p>
                  <p className="truncate">{l.email ?? "no email"}</p>
                </>
              )}
            </TD>
            <TD><WebsiteStatusBadge status={l.websiteStatus} /></TD>
            <TD><ScorePill score={l.leadScore} /></TD>
            <TD><LeadStatusBadge status={l.status} /></TD>
            <TD>{l.outreachStatus ? <StatusBadge status={l.outreachStatus} /> : <span className="text-muted-foreground">—</span>}</TD>
            <TD>{l.lastCallOutcome ? <StatusBadge status={l.lastCallOutcome} /> : <span className="text-muted-foreground">—</span>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
