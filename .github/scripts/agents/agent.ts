// Generic LLM-CLI wrapper. Subclasses pin the binary name and per-model
// argument shape; this base handles the shared concerns:
//
//   - primary→fallback escalation on non-zero exit
//   - wall-clock timeout via AbortController (no `timeout` shell-out)
//   - in-memory stdin/stdout/stderr capture — no tempfiles, no log files
//   - github-actions `::warning::` annotations on timeout / non-zero
//
// Stalled API calls are real (issue #175 — observed wedging the whole
// promote-tech-to-pr job for hours). The timeout is a hard cap that
// trips primary→fallback escalation rather than waiting indefinitely.

export type AgentOpts = {
  /** Primary model identifier (string passed to the CLI's --model flag). */
  primary: string;
  /** Fallback model — tried iff primary exits non-zero or times out. */
  fallback: string;
  /** Wall-clock seconds before the invocation is aborted. */
  timeout: number;
};

/** Exit-code semantics. Open record so subclasses can register any
 *  named code their CLI emits (e.g. `oom: 137`, `auth: 401`). The base
 *  class only requires `timeout`, which it synthesizes from a SIGTERM
 *  signal (AbortController abort → process catches SIGTERM → status
 *  reports signal). Subclasses whose CLIs use different conventions
 *  override `codes` with their own keys/values. */
export type Codes = { [name: string]: number };

/** What `prompt()` and `run()` return. `output` and `err` are the raw
 *  stdout/stderr byte buffers — caller decodes via `TextDecoder` if
 *  text is wanted. */
export type Result = {
  rc: number;
  output: Uint8Array;
  err: Uint8Array;
};

export class Agent {
  primary: string;
  fallback: string;
  timeout: number;

  /** Override per-agent if the CLI emits non-default exit-code semantics. */
  protected codes: Codes = { timeout: 124 };

  constructor(opts: AgentOpts) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    this.timeout = opts.timeout;
  }

  /** Override per-agent: the binary name (`claude`, `gemini`, ...) on PATH. */
  protected get cmd(): string {
    throw new Error("subclass must override `cmd`");
  }

  /** Override per-agent: build the CLI args for one invocation. Takes
   *  a destructurable opts object so subclasses can extend the shape
   *  later (e.g. `args({ model, tools })`) without breaking signatures. */
  protected args(_opts: { model: string }): string[] {
    throw new Error("subclass must override `args`");
  }

  /** One invocation, one model, with input bytes pre-buffered. Pure
   *  helper used by `prompt()` and `run()`. */
  private async spawn(model: string, input: Uint8Array): Promise<Result> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout * 1000);
    try {
      const proc = new Deno.Command(this.cmd, {
        args: this.args({ model }),
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        signal: ctrl.signal,
      }).spawn();
      try {
        const writer = proc.stdin.getWriter();
        try {
          await writer.write(input);
          await writer.close();
        } catch {
          try { writer.releaseLock(); proc.stdin.close(); } catch {}
          const [output, err] = await Promise.all([
            new Response(proc.stdout).bytes(),
            new Response(proc.stderr).bytes(),
          ]);
          const status = await proc.status;
          const stderr = new TextDecoder().decode(err).trim();
          const code = status.code ?? 1;
          throw new Error(
            this.cmd + " (model=" + this.args({ model }).join(" ") +
            ") exited " + code + " before input was fully written." +
            (stderr ? "\nstderr: " + stderr : "")
          );
        }

        const [output, err] = await Promise.all([
          new Response(proc.stdout).bytes(),
          new Response(proc.stderr).bytes(),
        ]);
        const status = await proc.status;
        const rc = status.signal === "SIGTERM" ? this.codes.timeout : (status.code ?? 1);
        return { rc, output, err };
      } catch (e) {
        if (ctrl.signal.aborted) {
          return { rc: this.codes.timeout, output: new Uint8Array(), err: new Uint8Array() };
        }
        throw e;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** One invocation, one model. Buffers the input stream once so
   *  callers can pass any ReadableStream backing. */
  async prompt(model: string, input: ReadableStream<Uint8Array>): Promise<Result> {
    return this.spawn(model, await new Response(input).bytes());
  }

  /** Try primary, then fallback on non-zero. Emits `::warning::`
   *  annotations + tails stderr to the runner log on escalation,
   *  matching the bash invoke_claude shape. Returns the final
   *  attempt's result. */
  async run(input: ReadableStream<Uint8Array>): Promise<Result> {
    const bytes = await new Response(input).bytes();
    let r = await this.spawn(this.primary, bytes);
    if (r.rc === this.codes.timeout) {
      console.error(
        `::warning::${this.cmd}: primary ${this.primary} timed out after ${this.timeout}s; falling back to ${this.fallback}`,
      );
    } else if (r.rc !== 0) {
      console.error(
        `::warning::${this.cmd}: primary ${this.primary} exited ${r.rc}; falling back to ${this.fallback}`,
      );
      console.error(tail(r.err, 50));
    }
    if (r.rc !== 0) {
      r = await this.spawn(this.fallback, bytes);
      if (r.rc === this.codes.timeout) {
        console.error(
          `::warning::${this.cmd}: fallback ${this.fallback} also timed out after ${this.timeout}s`,
        );
      } else if (r.rc !== 0) {
        console.error(tail(r.err, 50));
      }
    }
    return r;
  }
}

/** Last N lines of a byte buffer, decoded as UTF-8. */
function tail(bytes: Uint8Array, n: number): string {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}
