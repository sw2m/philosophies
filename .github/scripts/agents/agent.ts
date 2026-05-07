// Generic LLM-CLI wrapper. Subclasses pin the binary name and per-model
// argument shape; this base handles the shared concerns:
//
//   - primary→fallback escalation on non-zero exit
//   - wall-clock timeout via AbortController (no `timeout` shell-out)
//   - stderr capture to a log path callers can `tail` on diagnosis
//   - github-actions `::warning::` annotations on timeout / non-zero
//
// Stalled API calls are real (issue #175 — observed wedging the whole
// promote-tech-to-pr job for hours). The timeout is a hard cap that
// trips primary→fallback escalation rather than waiting indefinitely.

export type RunOpts = {
  /** Path to the file whose contents become the agent's stdin. */
  input: string;
  /** Path to write the agent's stdout to. Truncated on each invocation. */
  output: string;
};

export type AgentOpts = {
  /** Primary model identifier (string passed to the CLI's --model flag). */
  primary: string;
  /** Fallback model — tried iff primary exits non-zero or times out. */
  fallback: string;
  /** Wall-clock seconds before the invocation is aborted. */
  timeoutSecs: number;
  /** Path to redirect stderr to. Tailed on warnings; persists across calls
   *  (callers should rotate per attempt if they want isolated logs). */
  errLog: string;
};

export class Agent {
  primary: string;
  fallback: string;
  timeoutSecs: number;
  errLog: string;

  constructor(opts: AgentOpts) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    this.timeoutSecs = opts.timeoutSecs;
    this.errLog = opts.errLog;
  }

  /** Override per-agent: the binary name (`claude`, `gemini`, ...) on PATH. */
  protected get cmd(): string {
    throw new Error("subclass must override `cmd`");
  }

  /** Override per-agent: build the CLI args for the given model. */
  protected argsFor(_model: string): string[] {
    throw new Error("subclass must override `argsFor`");
  }

  /** One invocation, one model. Returns the exit code. 124 indicates the
   *  timeout aborted the call; >0 indicates the CLI failed normally. */
  async runOnce(model: string, opts: RunOpts): Promise<number> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutSecs * 1000);
    try {
      const stdin = await Deno.open(opts.input, { read: true });
      const stdout = await Deno.open(opts.output, {
        write: true,
        create: true,
        truncate: true,
      });
      const stderr = await Deno.open(this.errLog, {
        write: true,
        create: true,
        truncate: true,
      });

      try {
        const proc = new Deno.Command(this.cmd, {
          args: this.argsFor(model),
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
          signal: ctrl.signal,
        }).spawn();

        // Wire file → stdin, stdout → file, stderr → file.
        const pipe1 = stdin.readable.pipeTo(proc.stdin);
        const pipe2 = proc.stdout.pipeTo(stdout.writable);
        const pipe3 = proc.stderr.pipeTo(stderr.writable);

        const status = await proc.status;
        await Promise.allSettled([pipe1, pipe2, pipe3]);
        return status.signal === "SIGTERM" ? 124 : (status.code ?? 1);
      } catch (e) {
        if (ctrl.signal.aborted) return 124;
        throw e;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Try primary, then fallback on non-zero. Emits `::warning::`
   *  annotations + tails the err log on escalation, matching the bash
   *  invoke_claude shape. Returns the final exit code. */
  async run(opts: RunOpts): Promise<number> {
    let rc = await this.runOnce(this.primary, opts);
    if (rc === 124) {
      console.error(
        `::warning::${this.cmd}: primary ${this.primary} timed out after ${this.timeoutSecs}s; falling back to ${this.fallback}`,
      );
    } else if (rc !== 0) {
      console.error(
        `::warning::${this.cmd}: primary ${this.primary} exited ${rc}; falling back to ${this.fallback}`,
      );
      await tail(this.errLog, 50);
    }
    if (rc !== 0) {
      rc = await this.runOnce(this.fallback, opts);
      if (rc === 124) {
        console.error(
          `::warning::${this.cmd}: fallback ${this.fallback} also timed out after ${this.timeoutSecs}s`,
        );
      } else if (rc !== 0) {
        await tail(this.errLog, 50);
      }
    }
    return rc;
  }
}

/** Tail the last N lines of a log file to stderr. Best-effort — silent
 *  on read errors so log emission never masks the upstream failure. */
async function tail(path: string, n: number): Promise<void> {
  try {
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");
    const slice = lines.slice(Math.max(0, lines.length - n));
    for (const line of slice) console.error(line);
  } catch {
    // ignore
  }
}
