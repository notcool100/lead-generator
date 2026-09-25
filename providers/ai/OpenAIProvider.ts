import { z } from "zod";
import { AIOutputError, type AIProvider, type GenerateJsonRequest, type GenerateJsonResult, type ModelTier } from "./AIProvider";

/**
 * OpenAI Chat Completions with JSON mode. Secondary provider; output is
 * validated against the same Zod schema as Claude's.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    private readonly largeModel = "gpt-5",
    private readonly smallModel = "gpt-5-mini",
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for AI_PROVIDER=openai");
  }

  modelFor(tier: ModelTier) {
    return tier === "small" ? this.smallModel : this.largeModel;
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    const model = this.modelFor(req.tier);
    const jsonSchema = z.toJSONSchema(req.schema);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${req.system}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
          { role: "user", content: req.prompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    let raw: unknown;
    try {
      raw = JSON.parse(body.choices[0]?.message.content ?? "");
    } catch {
      throw new AIOutputError("OpenAI returned non-JSON output", body);
    }
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new AIOutputError(`AI output failed validation: ${parsed.error.message}`, raw);
    return {
      data: parsed.data,
      provider: this.name,
      model,
      raw,
      usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens },
    };
  }
}
