import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/utils";

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const WEBSITE: Record<string, Tone> = {
  unknown: "neutral", no_website: "red", poor_website: "amber", outdated: "amber", good_website: "green", excellent_website: "green", unreachable: "violet",
};
const LEAD: Record<string, Tone> = {
  discovered: "neutral", qualified: "blue", rejected: "neutral", analyzing: "blue", analyzed: "blue", preview_generating: "blue",
  preview_ready: "violet", outreach_draft: "amber", approved: "amber", contacted: "blue", replied: "green", interested: "green",
  not_interested: "neutral", converted: "green", suppressed: "red",
};
const GENERIC: Record<string, Tone> = {
  draft: "neutral", running: "green", paused: "amber", completed: "blue", archived: "neutral",
  pending: "neutral", building: "blue", deployed: "green", failed: "red",
  approved: "amber", queued: "blue", sent: "green", rejected: "neutral", cancelled: "neutral",
  scheduled: "blue", drafted: "amber", skipped: "neutral", processing: "blue",
  delivered: "green", bounced: "red", complained: "red", opened: "blue", clicked: "violet", replied: "green", unsubscribed: "red",
  // calls
  registered: "blue", ongoing: "blue", ended: "neutral", not_connected: "amber", error: "red",
  interested: "green", appointment_booked: "green", callback_requested: "violet", not_interested: "neutral",
  wrong_number: "red", no_answer: "amber", voicemail: "amber", do_not_contact: "red", unknown: "neutral",
};

export function WebsiteStatusBadge({ status }: { status: string }) {
  return <Badge tone={WEBSITE[status] ?? "neutral"}>{humanize(status)}</Badge>;
}
export function LeadStatusBadge({ status }: { status: string }) {
  return <Badge tone={LEAD[status] ?? "neutral"}>{humanize(status)}</Badge>;
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={GENERIC[status] ?? "neutral"}>{humanize(status)}</Badge>;
}
export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const tone = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${score}%` }} />
      </span>
      <span className="text-xs font-medium">{score}</span>
    </span>
  );
}
