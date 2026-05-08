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

import { Agent, type AgentOpts, type PipeOpts } from "./agent.ts";

export type Opts = Partial<Pick<AgentOpts, "primary" | "fallback" | "timeout" | "log">>;

export class Claude extends Agent {
  constructor(opts: Opts = {}) {
    super({
      primary: opts.primary ?? "claude-opus-4-5",
      fallback: opts.fallback ?? "claude-sonnet-4-5",
      timeout: opts.timeout ?? 900,
      log: opts.log ?? `${Deno.env.get("RUNNER_TEMP") ?? "/tmp"}/claude-err.log`,
    });
  }

  protected override get cmd(): string {
    return "claude";
  }

  protected override argsFor(model: string): string[] {
    return [
      "--print",
      "--model",
      model,
      "--allowed-tools",
      "Bash Edit Write Read Glob Grep",
      "--permission-mode",
      "bypassPermissions",
    ];
  }
}

export type { PipeOpts };
