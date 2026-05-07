// Generic Check Runs API primitive. One `Check` instance per Check Run.
// `implements CheckRun` (the canonical Octokit entity type) so the instance
// IS the check run after it's created — its CheckRun-schema fields are
// populated from the API response.
//
// Designed to be imported from inside a `github-deno` action's `script:`
// input. The caller's user-script gets `github` (Octokit) and `context`
// injected by the runner.
//
// Phase-3-specific concerns (the catalog, per-(slug, reviewer) naming,
// verdict aggregation) live in `./phase-3-category.ts`. This file is
// agnostic to caller domain.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

// API-shipped enums + entity shape, pulled from the Check Runs endpoint
// definitions. Literal unions live in @octokit/types — not duplicated here.
type CreateOp = Endpoints["POST /repos/{owner}/{repo}/check-runs"];
export type Conclusion = NonNullable<CreateOp["parameters"]["conclusion"]>;
export type Status = NonNullable<CreateOp["parameters"]["status"]>;
export type CheckRun = CreateOp["response"]["data"];

export interface TitleOpts {
  stale?: boolean;
  terminal?: string;
  head?: string;
}

export interface StartOpts {
  round?: number;
  status?: Status;
}

export interface CompleteOpts extends TitleOpts {
  round?: number;
  verdict?: string;
  body?: string;
  /** Override the derived title; bypasses `round`/`verdict` formatting. */
  title?: string;
  /** Override the derived summary; bypasses `body` formatting. */
  summary?: string;
}

/**
 * One Check Run. `implements CheckRun` — instance is the entity after
 * `start()` / `submit()` populates its schema fields from the API response.
 *
 * Static methods carry the output formatting helpers (`title`, `summary`)
 * since they're concerns of the Check Run's `output` field shape.
 *
 * Lifecycle:
 *   - `start()` then `complete()` / `cancel()` for in-progress→completed.
 *   - `submit()` for one-shot completed creation (aggregate / inapplicable).
 *
 * Each transition replaces the instance's CheckRun fields with the latest
 * API response, so a consumer reading `check.id`, `check.status`,
 * `check.conclusion`, etc. always gets the freshest server-side state.
 */
export class Check implements CheckRun {
  /** Format an `output.title` string. Throws if `stale` is set without the SHAs it needs. */
  static title(round: number, verdict: string, opts: TitleOpts = {}): string {
    const { stale, terminal, head } = opts;
    if (stale) {
      if (!terminal || !head) {
        throw new Error("Check.title(): stale requires both `terminal` and `head` SHA inputs");
      }
      return `terminal-stated at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
    }
    return `round ${round}: ${verdict}`;
  }

  /** Format an `output.summary` string with optional stale-prefix annotation. */
  static summary(body: string, opts: TitleOpts = {}): string {
    const { stale, terminal } = opts;
    if (stale) {
      if (!terminal) {
        throw new Error("Check.summary(): stale requires `terminal` SHA input");
      }
      return `Stale: this category terminal-stated at ${terminal.slice(0, 8)}; the body below is the prior review.\n\n${body}`;
    }
    return body;
  }

  // CheckRun schema fields. Set in constructor:
  head_sha: string;
  name: string;
  // Set by API responses (definite-assignment-asserted; reading before
  // start()/submit() is a usage error, not a type error):
  id!: CheckRun["id"];
  node_id!: CheckRun["node_id"];
  external_id!: CheckRun["external_id"];
  url!: CheckRun["url"];
  html_url!: CheckRun["html_url"];
  details_url!: CheckRun["details_url"];
  status!: CheckRun["status"];
  conclusion!: CheckRun["conclusion"];
  started_at!: CheckRun["started_at"];
  completed_at!: CheckRun["completed_at"];
  output!: CheckRun["output"];
  check_suite!: CheckRun["check_suite"];
  app!: CheckRun["app"];
  pull_requests!: CheckRun["pull_requests"];
  deployment?: CheckRun["deployment"];

  // Internal lifecycle flag — distinct from `id`, which TS believes is always
  // a number once declared. Lets us guard double-`start()` cleanly.
  private created = false;

  constructor(
    private readonly github: Github,
    private readonly context: Context,
    sha: string,
    name: string,
  ) {
    this.head_sha = sha;
    this.name = name;
  }

  /** POST a new Check Run in `in_progress` status (default). Hydrates instance. */
  async start(opts: StartOpts = {}): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: start() called twice on the same instance`);
    }
    const { round = 1, status = "in_progress" } = opts;
    const res = await this.github.rest.checks.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status,
      output: {
        title: Check.title(round, "pending"),
        summary: `Check run started for ${this.name}`,
      },
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }

  /** PATCH the started Check Run to a terminal conclusion. Requires `start()` first. */
  async complete(conclusion: Conclusion, opts: CompleteOpts = {}): Promise<this> {
    if (!this.created) {
      throw new Error(`Check ${this.name}: complete() called before start()`);
    }
    const t = opts.title ?? Check.title(opts.round ?? 1, opts.verdict ?? conclusion, opts);
    const s = opts.summary ?? Check.summary(opts.body ?? "", opts);
    const res = await this.github.rest.checks.update({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      conclusion,
      output: { title: t, summary: s },
    });
    Object.assign(this, res.data);
    return this;
  }

  /** PATCH the started Check Run to `cancelled`. For workflow-cancellation cleanup hooks. */
  async cancel(): Promise<this> {
    if (!this.created) {
      throw new Error(`Check ${this.name}: cancel() called before start()`);
    }
    const res = await this.github.rest.checks.update({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      conclusion: "cancelled",
      output: { title: "cancelled mid-run", summary: "Workflow cancelled." },
    });
    Object.assign(this, res.data);
    return this;
  }

  /**
   * One-shot: POST a Check Run already in `completed` state. For aggregate
   * and inapplicable flows where the start→complete split adds nothing.
   */
  async submit(conclusion: Conclusion, opts: CompleteOpts = {}): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: submit() called on an already-created Check`);
    }
    const t = opts.title ?? Check.title(opts.round ?? 1, opts.verdict ?? conclusion, opts);
    const s = opts.summary ?? Check.summary(opts.body ?? "", opts);
    const res = await this.github.rest.checks.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status: "completed",
      conclusion,
      output: { title: t, summary: s },
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }
}
