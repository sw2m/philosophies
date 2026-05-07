// Generic Check Runs API primitive. One `Check` instance per Check Run.
// `implements CheckRun` (the canonical Octokit entity type) so the instance
// IS the check run after it's created.
//
// This module is unopinionated — input types are derived directly from
// Octokit's endpoint parameters via `@octokit/types`'s `Endpoints` map, with
// only the constructor-known fields (`owner`, `repo`, `name`, `head_sha`,
// `check_run_id`, plus `status` where the lifecycle method dictates it)
// stripped. Callers who want simplified or opinionated input shapes use
// the VSDD-flavored subclass at `../vsdd/check.ts`.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

type CreateOp = Endpoints["POST /repos/{owner}/{repo}/check-runs"];
type UpdateOp = Endpoints["PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}"];

export type Conclusion = NonNullable<CreateOp["parameters"]["conclusion"]>;
export type Status = NonNullable<CreateOp["parameters"]["status"]>;
export type CheckRun = CreateOp["response"]["data"];

/** What `start()` accepts — the create-endpoint params minus constructor-known
 *  fields (`owner`, `repo`, `name`, `head_sha`) and the terminal-state fields
 *  (`conclusion`, `completed_at`) that don't apply to a Check being kicked
 *  off into `in_progress`. */
export type StartInput = Omit<
  CreateOp["parameters"],
  "owner" | "repo" | "name" | "head_sha" | "conclusion" | "completed_at"
>;

/** What `complete()` accepts — the PATCH update params minus constructor-known
 *  fields, with `conclusion` promoted to required (we're transitioning to a
 *  terminal state) and `status` omitted (always "completed" here). */
export type CompleteInput =
  & Omit<UpdateOp["parameters"], "owner" | "repo" | "check_run_id" | "name" | "head_sha" | "status">
  & { conclusion: Conclusion };

/** What `submit()` accepts — same shape as `start()` but for one-shot
 *  POST-as-completed; `status` omitted (we set "completed") and `conclusion`
 *  required. */
export type SubmitInput =
  & Omit<CreateOp["parameters"], "owner" | "repo" | "name" | "head_sha" | "status">
  & { conclusion: Conclusion };

/** Bundle of (Octokit, actions context). The two values always travel
 *  together; passing one struct keeps constructor signatures sane. */
export interface OctokitContext {
  github: Github;
  context: Context;
}

/**
 * One Check Run. `implements CheckRun` — instance is the entity after
 * `start()` / `submit()` populates its schema fields from the API response.
 *
 * Lifecycle:
 *   - `start(input)` then `complete(input)` / `cancel()` for in-progress→terminal.
 *   - `submit(input)` for one-shot completed creation.
 *
 * Each transition replaces the instance's CheckRun fields with the latest
 * API response, so consumers reading `check.id`, `check.status`,
 * `check.conclusion`, etc. always see the freshest server-side state.
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

  // Internal lifecycle flag — guards double-`start()`, `complete()` /
  // `cancel()` before `start()`, and `submit()` on already-created.
  protected created = false;

  constructor(
    protected readonly api: OctokitContext,
    head_sha: string,
    name: string,
  ) {
    this.head_sha = head_sha;
    this.name = name;
  }

  /** POST a new Check Run. Defaults `status` to `"in_progress"`; caller can
   *  override anything else the API accepts. */
  async start(input: StartInput = {}): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: start() called twice on the same instance`);
    }
    const res = await this.api.github.rest.checks.create({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status: "in_progress",
      ...input,
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }

  /** PATCH the started Check Run to a terminal conclusion. Requires `start()`. */
  async complete(input: CompleteInput): Promise<this> {
    if (!this.created) {
      throw new Error(`Check ${this.name}: complete() called before start()`);
    }
    const res = await this.api.github.rest.checks.update({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      ...input,
    });
    Object.assign(this, res.data);
    return this;
  }

  /** Convenience: complete with `conclusion: "cancelled"` and the canonical
   *  cancellation output strings. For workflow-cancellation cleanup hooks. */
  async cancel(): Promise<this> {
    return this.complete({
      conclusion: "cancelled",
      output: { title: "cancelled mid-run", summary: "Workflow cancelled." },
    });
  }

  /** One-shot: POST a Check Run already in `completed` state. */
  async submit(input: SubmitInput): Promise<this> {
    if (this.created) {
      throw new Error(`Check ${this.name}: submit() called on an already-created Check`);
    }
    const res = await this.api.github.rest.checks.create({
      owner: this.api.context.repo.owner,
      repo: this.api.context.repo.repo,
      name: this.name,
      head_sha: this.head_sha,
      status: "completed",
      ...input,
    });
    Object.assign(this, res.data);
    this.created = true;
    return this;
  }
}
