import type { z } from "zod";

export type ModelTier = "small" | "large";

export interface GenerateJsonRequest<T> {
  /** Stable system prompt (cache-friendly: no timestamps / ids). */
  system: string;
  /** Per-call user content. */
  prompt: string;
  schema: z.ZodType<T>;
  /** Name used in logs and for the JSON schema title. */
  schemaName: string;
  tier: ModelTier;
  maxTokens?: number;
}

export interface GenerateJsonResult<T> {
  data: T;
  provider: string;
  model: string;
  raw: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AIProvider {
  readonly name: string;
  modelFor(tier: ModelTier): string;
  /** Returns schema-validated JSON. Implementations must never return unvalidated output. */
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>>;
}

export class AIOutputError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
  }
}
