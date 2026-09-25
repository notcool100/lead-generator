import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { AIOutputError, type AIProvider, type GenerateJsonRequest, type GenerateJsonResult, type ModelTier } from "./AIProvider";

/**
 * Runs Claude through the locally installed, logged-in Claude Code CLI
 * (`claude -p`) so the app uses your Claude subscription instead of an API key.
 *
 * Intended for personal/internal use on a machine where `claude` is logged in.
 * It is subject to your plan's usage limits and does not work inside Docker
 * unless the CLI is installed and logged in there. For a deployed, multi-user
 * service use AI_PROVIDER=anthropic with an API key.
 */
interface CliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface ClaudeCodeRunOptions {
  /** Built-in Claude Code tools to allow, e.g. ["WebSearch"]. Default: none. */
  tools?: string[];
  timeoutMs?: number;
}

export class ClaudeCodeProvider implements AIProvider {
  readonly name = "claude_code";
  private readonly workDir: string;

  constructor(
    private readonly largeModel: string,
    private readonly smallModel: string,
    private readonly bin = process.env.CLAUDE_CODE_BIN ?? "claude",
  ) {
    // Isolated cwd so no project CLAUDE.md / settings leak into prompts.
    this.workDir = path.join(os.tmpdir(), "lead-generator-claude");
    mkdirSync(this.workDir, { recursive: true });
  }

  modelFor(tier: ModelTier) {
    return tier === "small" ? this.smallModel : this.largeModel;
  }

  async generateJson<T>(req: GenerateJsonRequest<T>, opts: ClaudeCodeRunOptions = {}): Promise<GenerateJsonResult<T>> {
    const model = this.modelFor(req.tier);
    // The CLI validates --json-schema itself and rejects the "$schema" meta-schema URI, so drop it.
    const { $schema: _meta, ...schema } = z.toJSONSchema(req.schema, { target: "draft-7" }) as Record<string, unknown>;
    void _meta;
    const tools = opts.tools ?? [];
    const args = [
      "-p",
      "--output-format", "json",
      "--no-session-persistence",
      "--model", model,
      "--system-prompt", req.system,
      "--json-schema", JSON.stringify(schema),
      "--tools", tools.length ? tools.join(",") : "",
      ...(tools.length ? ["--allowedTools", ...tools] : []),
    ];

    const out = await this.run(args, req.prompt, opts.timeoutMs ?? (tools.length ? 300_000 : 180_000));
    let parsed: CliResult;
    try {
      parsed = JSON.parse(out) as CliResult;
    } catch {
      throw new AIOutputError(`Claude Code returned non-JSON output: ${out.slice(0, 300)}`);
    }
    if (parsed.is_error || parsed.subtype !== "success") {
      throw new AIOutputError(`Claude Code error (${parsed.subtype}): ${String(parsed.result ?? "").slice(0, 300)}`, parsed);
    }
    let data: unknown = parsed.structured_output;
    if (data === undefined && parsed.result) {
      try {
        data = JSON.parse(parsed.result);
      } catch {
        throw new AIOutputError("Claude Code did not return structured output", parsed);
      }
    }
    const valid = req.schema.safeParse(data);
    if (!valid.success) throw new AIOutputError(`AI output failed validation: ${valid.error.message}`, data);
    return {
      data: valid.data,
      provider: this.name,
      model,
      raw: data,
      usage: { inputTokens: parsed.usage?.input_tokens, outputTokens: parsed.usage?.output_tokens },
    };
  }

  private run(args: string[], stdin: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // Never pass an API key through: the CLI must use the subscription login.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;
      const child = spawn(this.bin, args, { cwd: this.workDir, env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Claude Code timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not start Claude Code CLI (${this.bin}): ${err.message}. Install it and run \`claude\` once to log in.`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (stdout.trim().startsWith("{")) return resolve(stdout);
        reject(new Error(`Claude Code exited with code ${code}: ${(stderr || stdout).slice(0, 400)}`));
      });
      child.stdin.end(stdin);
    });
  }
}
