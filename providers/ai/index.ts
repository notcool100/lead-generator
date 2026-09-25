import { env } from "@/lib/env";
import type { AIProvider } from "./AIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { MockAIProvider } from "./MockAIProvider";
import { ClaudeCodeProvider } from "./ClaudeCodeProvider";

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (instance) return instance;
  const e = env();
  if (e.AI_PROVIDER === "claude_code") instance = new ClaudeCodeProvider(e.CLAUDE_CODE_MODEL, e.CLAUDE_CODE_SMALL_MODEL);
  else if (e.AI_PROVIDER === "openai") instance = new OpenAIProvider(e.OPENAI_API_KEY ?? "");
  else if (e.AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY)
    instance = new AnthropicProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL, e.AI_SMALL_MODEL);
  else instance = new MockAIProvider();
  return instance;
}

export function setAIProviderForTests(p: AIProvider | null) {
  instance = p;
}

export type { AIProvider };
