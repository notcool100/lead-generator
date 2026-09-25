import type { AIProvider, GenerateJsonRequest, GenerateJsonResult, ModelTier } from "./AIProvider";

/**
 * Deterministic, offline provider for local development and tests. Each prompt
 * builder registers a `fallback` that produces a conservative, fact-only result
 * from the input data — so nothing is fabricated even without an LLM.
 */
export type MockHandler = (prompt: string) => unknown;

const handlers = new Map<string, MockHandler>();

export function registerMockHandler(schemaName: string, handler: MockHandler) {
  handlers.set(schemaName, handler);
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  modelFor(tier: ModelTier) {
    return tier === "small" ? "mock-small" : "mock-large";
  }

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    const handler = handlers.get(req.schemaName);
    if (!handler) throw new Error(`No mock handler registered for ${req.schemaName}`);
    const raw = handler(req.prompt);
    const data = req.schema.parse(raw);
    return { data, provider: this.name, model: this.modelFor(req.tier), raw };
  }
}
