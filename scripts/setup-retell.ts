/**
 * Creates (or updates) the Retell voice agent used for AI cold calls:
 *   pnpm retell:setup
 *
 * Needs RETELL_API_KEY and APP_URL (public, so Retell can reach the webhook).
 * Optional: RETELL_AGENT_ID (update instead of create), RETELL_VOICE_ID,
 * RETELL_LLM_MODEL (default claude-4.5-haiku — fast enough for live calls),
 * RETELL_FROM_NUMBER (the imported Twilio number; the agent is bound to it).
 */
import "dotenv/config";
import { COLD_CALL_BEGIN_MESSAGE, COLD_CALL_PROMPT, POST_CALL_ANALYSIS, type CallDynamicVariables } from "@/prompts/cold-call";
import { RetellClient } from "@/providers/calling/RetellClient";

const apiKey = process.env.RETELL_API_KEY;
const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!apiKey) {
  console.error("Set RETELL_API_KEY first (Retell dashboard → API Keys).");
  process.exit(1);
}
if (!/^https:\/\//.test(appUrl)) console.warn(`⚠ APP_URL is "${appUrl}" — Retell needs a public https URL to deliver call results.`);

const client = new RetellClient(apiKey);
const webhookUrl = `${appUrl}/api/webhooks/retell`;

const emptyVars: CallDynamicVariables = {
  agent_name: "Alex", company_name: "", sender_name: "", business_name: "", category: "", city: "",
  monthly_price: "", offer_includes: "", observation: "", preview_url: "", email_on_file: "",
};

const llmBody = {
  model: process.env.RETELL_LLM_MODEL ?? "claude-4.5-haiku",
  model_temperature: 0.3,
  start_speaker: "agent",
  begin_message: COLD_CALL_BEGIN_MESSAGE,
  general_prompt: COLD_CALL_PROMPT,
  default_dynamic_variables: emptyVars,
  general_tools: [
    {
      type: "end_call",
      name: "end_call",
      description: "Hang up once the conversation is finished: after saying goodbye, when the person is not interested, asks not to be called again, it's a wrong number, or they are busy and a callback time was noted.",
    },
  ],
};

async function pickVoice(): Promise<string> {
  if (process.env.RETELL_VOICE_ID) return process.env.RETELL_VOICE_ID;
  const voices = await client.request<{ voice_id: string; voice_name?: string; provider: string; accent?: string; gender?: string }[]>("/list-voices", undefined, "GET");
  const pick =
    voices.find((v) => v.provider === "elevenlabs" && /american/i.test(v.accent ?? "")) ??
    voices.find((v) => /american|us/i.test(v.accent ?? "")) ??
    voices[0];
  if (!pick) throw new Error("No voices available on this Retell account — set RETELL_VOICE_ID");
  console.log(`Using voice ${pick.voice_id} (${pick.voice_name ?? pick.provider}${pick.accent ? `, ${pick.accent}` : ""}). Override with RETELL_VOICE_ID.`);
  return pick.voice_id;
}

const agentBody = (llmId: string, voiceId: string) => ({
  agent_name: "Lead Generator — website offer",
  response_engine: { type: "retell-llm", llm_id: llmId },
  voice_id: voiceId,
  language: "en-US",
  webhook_url: webhookUrl,
  webhook_events: ["call_started", "call_ended", "call_analyzed"],
  post_call_analysis_data: POST_CALL_ANALYSIS,
  // Don't leave AI voicemails — hang up and record the outcome as "voicemail".
  voicemail_option: { action: { type: "hangup" } },
  end_call_after_silence_ms: 20_000,
  max_call_duration_ms: 6 * 60_000,
  enable_backchannel: true,
});

async function main() {
  const voiceId = await pickVoice();
  let agentId = process.env.RETELL_AGENT_ID;

  if (agentId) {
    const agent = await client.request<{ response_engine: { type: string; llm_id?: string } }>(`/get-agent/${agentId}`, undefined, "GET");
    const llmId = agent.response_engine.llm_id;
    if (agent.response_engine.type !== "retell-llm" || !llmId) throw new Error("RETELL_AGENT_ID doesn't use a Retell LLM — unset it to create a new agent");
    await client.request(`/update-retell-llm/${llmId}`, llmBody, "PATCH");
    await client.request(`/update-agent/${agentId}`, agentBody(llmId, voiceId), "PATCH");
    console.log(`✔ Updated agent ${agentId} (LLM ${llmId})`);
  } else {
    const llm = await client.request<{ llm_id: string }>("/create-retell-llm", llmBody);
    const agent = await client.request<{ agent_id: string }>("/create-agent", agentBody(llm.llm_id, voiceId));
    agentId = agent.agent_id;
    console.log(`✔ Created agent ${agentId} (LLM ${llm.llm_id})`);
    console.log(`\nAdd this to your environment (.env / Coolify):\n  RETELL_AGENT_ID=${agentId}\n`);
  }

  const from = process.env.RETELL_FROM_NUMBER;
  if (from) {
    try {
      await client.request(`/update-phone-number/${encodeURIComponent(from)}`, { outbound_agents: [{ agent_id: agentId, weight: 1 }] }, "PATCH");
      console.log(`✔ Bound ${from} to the agent for outbound calls`);
    } catch (err) {
      console.warn(`⚠ Couldn't bind ${from} to the agent (${err instanceof Error ? err.message : err}). Import the Twilio number into Retell first; calls still pass the agent explicitly.`);
    }
  } else {
    console.warn("⚠ RETELL_FROM_NUMBER not set — import your Twilio number into Retell and set it (E.164, e.g. +14155550123).");
  }
  console.log(`Webhook: ${webhookUrl}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
