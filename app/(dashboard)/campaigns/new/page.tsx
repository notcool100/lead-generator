import { PageHeader } from "@/components/page-header";
import { env } from "@/lib/env";
import { LEAD_SOURCES, sourceAvailability } from "@/providers/leads";
import { callingConfigured } from "@/services/calling/callService";
import { CampaignWizard } from "./wizard";

export default function NewCampaignPage() {
  const defaults = env().LEAD_PROVIDER.split(",").map((s) => s.trim());
  const sources = LEAD_SOURCES.map((s) => ({ ...s, ...sourceAvailability(s.key), default: defaults.includes(s.key) }));
  return (
    <>
      <PageHeader title="New campaign" description="Define who to find, where to look, what qualifies them, and how outreach is handled." />
      <CampaignWizard sources={sources} callingReady={callingConfigured().ok} />
    </>
  );
}
