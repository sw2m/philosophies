// Generic Check Runs API primitive. One `Check` instance per Check Run.
// `implements CheckRun` (the canonical Octokit entity type) so the instance
// IS the check run after it's created — its CheckRun-schema fields are
// populated from the API response.
//
// Designed to be imported from inside a `github-deno` action's `script:`
// input. The caller's user-script gets `github` (Octokit) and `context`
// injected by the runner; bundle them into an `OctokitContext` and pass
// to `Check`'s constructor.
//
// Phase-3-specific concerns (the catalog, per-(slug, reviewer) naming,
// verdict aggregation) live in `../vsdd/phase-3-check.ts`. VSDD review-
// cycle formatting (round/verdict, terminal-stated annotations) lives in
// `../vsdd/check.ts`. This file is agnostic to caller domain.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

// API-shipped enums + entity shape. Literal unions live in @octokit/types —
// not duplicated here.
type CreateOp = Endpoints["POST /repos/{owner}/{repo}/check-runs"];
export type Conclusion = NonNullable<CreateOp["parameters"]["conclusion"]>;
export type Status = NonNullable<CreateOp["parameters"]["status"]>;
export type CheckRun = CreateOp["response"]["data"];

/** Bundle of (github Octokit, actions context). The two values always travel
 *  together; passing one struct keeps constructor signatures sane. */
export interface OctokitContext {
  github: Github;
  context: Context;
}

export interface StartOpts {
  status?: Status;
  title?: string;
  summary?: string;
}

/** Input for `complete()` and `submit()` — single object containing the
 *  conclusion and any output fields. Subclasses widen this with extra
 *  formatting keys (round, verdict, stale-annotation SHAs, etc.). */
export interface CheckResult {
  conclusion: Conclusion;
  title?: string;
  summary?: string;
}

/**
 * One Check Run. `implements CheckRun` — instance is the entity after
 * `start()` / `submit()` populates its schema fields from the API response.
 *
 * Lifecycle:
 *   - `start()` then `complete(result)` / `cancel()` for in-progress→terminal.
 *   - `submit(result)` for one-shot completed creation.
 *
 * Each transition replaces the instance's CheckRun fields with the latest
 * API response, so a consumer reading `check.id`, `check.status`,
 * `check.conclusion`, etc. always sees the freshest server-side state.
 */
export class Check implements CheckRun {
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

  // Internal lifecycle flag — guards against double-`start()`,
  // `complete()` before `start()`, and `submit()` on already-created.
  protected created = false;

  constructor(
    protected readonly api: OctokitContext,
    head_sha: string,
    name: string,
  ) {
    this.head_sha = head_sha;
    this.name = name;
  }

  /** POST a new Check Run in `in_progress` status. Hydrates instance. */
  async start(opts: StartOpts = {}): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: start() called twice on the same instance`);
    }
    const { status = "in_progress", title = "starting", summary = `Check run started for ${this.name}` } = opts;
    const res = await this.api.github.rest.checks.create({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status,
      output: { title, summary },
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }

  /** PATCH the started Check Run to a terminal conclusion. Requires `start()` first. */
  async complete(result: CheckResult): Promise<this> {
    if (!this.created) {
      throw new Error(`Check ${this.name}: complete() called before start()`);
    }
    const { conclusion, title = String(conclusion), summary = "" } = result;
    const res = await this.api.github.rest.checks.update({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      conclusion,
      output: { title, summary },
    });
    Object.assign(this, res.data);
    return this;
  }

  /** Convenience: `complete({ conclusion: "cancelled", … })` with the canonical
   *  cancellation strings. For workflow-cancellation cleanup hooks. */
  async cancel(): Promise<this> {
    return this.complete({
      conclusion: "cancelled",
      title: "cancelled mid-run",
      summary: "Workflow cancelled.",
    });
  }

  /** One-shot: POST a Check Run already in `completed` state. Hydrates instance. */
  async submit(result: CheckResult): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: submit() called on an already-created Check`);
    }
    const { conclusion, title = String(conclusion), summary = "" } = result;
    const res = await this.api.github.rest.checks.create({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status: "completed",
      conclusion,
      output: { title, summary },
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }
}
