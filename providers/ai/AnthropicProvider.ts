import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AIOutputError, type AIProvider, type GenerateJsonRequest, type GenerateJsonResult, type ModelTier } from "./AIProvider";

/**
 * Claude via the official SDK. Uses structured outputs (`output_config.format`)
 * so the response is constrained to the Zod schema, then re-validates it.
 * The API key is only ever read server-side.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private readonly largeModel: string,
    private readonly smallModel: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 120_000 });
  }

  modelFor(tier: ModelTier) {
    return tier === "small" ? this.smallModel : this.largeModel;
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    const model = this.modelFor(req.tier);
    const response = await this.client.messages.parse({
      model,
      max_tokens: req.maxTokens ?? 4000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.prompt }],
      output_config: {
        format: zodOutputFormat(req.schema as never),
        ...(req.tier === "small" ? {} : { effort: "medium" as const }),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new AIOutputError(`Model declined the request (${response.stop_details?.category ?? "unknown"})`, response);
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIOutputError("Model output was truncated (max_tokens)", response);
    }
    const parsed = req.schema.safeParse(response.parsed_output);
    if (!parsed.success) {
      throw new AIOutputError(`AI output failed validation: ${parsed.error.message}`, response.parsed_output);
    }
    return {
      data: parsed.data,
      provider: this.name,
      model,
      raw: response.parsed_output,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
