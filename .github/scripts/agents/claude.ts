// Anthropic Claude Code CLI wrapper. Pins the per-model arg shape used
// by `promote-tech-to-pr`'s Phase 2 / Phase 4 agent invocations.
//
// Defaults:
//   - primary  = claude-opus-4-5
//   - fallback = claude-sonnet-4-5
//   - timeout  = 900s (matches the action.yml default)
//
// CLI flags:
//   --print                                  (non-interactive, stdin → stdout)
//   --model <model>
//   --allowed-tools "Bash Edit Write Read Glob Grep"
//   --permission-mode bypassPermissions      (no per-call confirmation)

import { Agent, type AgentOpts } from "./agent.ts";

export type Opts =
  & Partial<Pick<AgentOpts, "primary" | "fallback" | "timeout">>
  & {
    /** Space-separated list of tools claude is permitted to invoke (e.g.
     *  `"Bash Edit Write Read Glob Grep"`). Empty string = inference-only. */
    tools?: string;
    /** Permission mode flag passed to claude (e.g. `bypassPermissions`).
     *  Empty = omit the flag, claude uses its default. */
    mode?: string;
  };

export class Claude extends Agent {
  tools: string;
  mode: string;

  static installed = false;
  static async install(): Promise<void> {
    if (Claude.installed) return;
    const check = new Deno.Command("claude", { args: ["--version"], stdout: "null", stderr: "null" });
    try { if ((await check.output()).code === 0) { Claude.installed = true; return; } } catch {}
    const proc = new Deno.Command("npm", { args: ["install", "-g", "@anthropic-ai/claude-code@latest"], stdout: "inherit", stderr: "inherit" });
    const { code } = await proc.output();
    if (code !== 0) throw new Error("Failed to install Claude Code CLI");
    Claude.installed = true;
  }

  constructor(opts: Opts = {}) {
    super({
      primary: opts.primary ?? "claude-opus-4-5",
      fallback: opts.fallback ?? "claude-sonnet-4-5",
      timeout: opts.timeout ?? 900,
    });
    this.tools = opts.tools ?? "Bash Edit Write Read Glob Grep";
    this.mode = opts.mode ?? "bypassPermissions";
  }

  protected override get cmd(): string {
    return "claude";
  }

  override async run(input: ReadableStream<Uint8Array>) {
    await Claude.install();
    return super.run(input);
  }

  override async prompt(model: string, input: ReadableStream<Uint8Array>) {
    await Claude.install();
    return super.prompt(model, input);
  }

  protected override args({ model }: { model: string }): string[] {
    const out = ["--print", "--model", model, "--allowed-tools", this.tools];
    if (this.mode) out.push("--permission-mode", this.mode);
    return out;
  }
}


