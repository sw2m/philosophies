// Google Gemini CLI wrapper. Pins the per-model arg shape used by the
// `actions/agents/gemini` composite for Phase 1c / Phase 3 review.
//
// CLI flags (matching the composite):
//   --yolo                     (non-interactive)
//   --skip-trust               (skip workspace-trust prompt)
//   -m <model>

import { Agent, type AgentOpts } from "./agent.ts";

export type Opts = Partial<Pick<AgentOpts, "primary" | "fallback" | "timeout">>;

export class Gemini extends Agent {
  static installed = false;
  static async install(): Promise<void> {
    if (Gemini.installed) return;
    const check = new Deno.Command("gemini", { args: ["--version"], stdout: "null", stderr: "null" });
    try { if ((await check.output()).code === 0) { Gemini.installed = true; return; } } catch {}
    const proc = new Deno.Command("npm", { args: ["install", "-g", "@google/gemini-cli@latest"], stdout: "inherit", stderr: "inherit" });
    const { code } = await proc.output();
    if (code !== 0) throw new Error("Failed to install gemini-cli");
    Gemini.installed = true;
  }

  constructor(opts: Opts = {}) {
    super({
      primary: opts.primary ?? "gemini-2.5-pro",
      fallback: opts.fallback ?? "gemini-2.5-flash",
      timeout: opts.timeout ?? 900,
    });
  }

  protected override get cmd(): string {
    return "gemini";
  }

  override async run(input: ReadableStream<Uint8Array>) {
    await Gemini.install();
    return super.run(input);
  }

  override async prompt(model: string, input: ReadableStream<Uint8Array>) {
    await Gemini.install();
    return super.prompt(model, input);
  }

  protected override args({ model }: { model: string }): string[] {
    return ["--yolo", "--skip-trust", "-m", model];
  }
}
