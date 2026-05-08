// Google Gemini CLI wrapper. Pins the per-model arg shape used by the
// `actions/agents/gemini` composite for Phase 1c / Phase 3 review.
//
// CLI flags (matching the composite):
//   --yolo                     (non-interactive)
//   --skip-trust               (skip workspace-trust prompt)
//   -m <model>

import { Agent, type AgentOpts, type PipeOpts } from "./agent.ts";

export type Opts = Partial<Pick<AgentOpts, "primary" | "fallback" | "timeout" | "log">>;

export class Gemini extends Agent {
  constructor(opts: Opts = {}) {
    super({
      primary: opts.primary ?? "gemini-2.5-pro",
      fallback: opts.fallback ?? "gemini-2.5-flash",
      timeout: opts.timeout ?? 900,
      log: opts.log ?? `${Deno.env.get("RUNNER_TEMP") ?? "/tmp"}/gemini-err.log`,
    });
  }

  protected override get cmd(): string {
    return "gemini";
  }

  protected override argsFor(model: string): string[] {
    return ["--yolo", "--skip-trust", "-m", model];
  }
}

export type { PipeOpts };
