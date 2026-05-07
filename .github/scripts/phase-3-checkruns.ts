// Per-(category, reviewer) Check Runs API helpers for Phase 3 (#181 / #185).
//
// Designed to be imported from inside a `github-deno` action's `script:`
// input. The caller's user-script gets `github` (Octokit) and `context`
// injected by the runner; this module wraps the Check Runs API in
// instance-stateful objects so the create→update id-passing dance is
// internal to the abstraction.
//
// Source-of-truth: category slugs and display names come from the canonical
// catalog at `.github/assets/symbols.yaml` via `./symbols.ts`. Octokit-shipped
// types (Conclusion, Status, etc.) come from npm:@octokit/types and
// npm:@actions/github — no locally-invented enums.
//
// Layering:
//   - `CheckRun`         — generic primitive, one instance per Check Run.
//   - `Phase3Category`   — domain layer, composes CheckRun against the
//                          catalog's per-(slug, reviewer) naming convention.
//   - `title` / `summary` / `conclude` — pure data transforms exported as
//     free functions; no state.

import { SYMBOLS } from "./symbols.ts";
import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

// API-shipped enums — the literal unions live in @octokit/types where they
// belong, not duplicated locally.
type CreateParams = Endpoints["POST /repos/{owner}/{repo}/check-runs"]["parameters"];
export type Conclusion = NonNullable<CreateParams["conclusion"]>;
export type Status = NonNullable<CreateParams["status"]>;

// ─── Pure helpers ──────────────────────────────────────────────────────────

export interface TitleOpts {
  stale?: boolean;
  terminal?: string;
  head?: string;
}

export function title(round: number, verdict: string, opts: TitleOpts = {}): string {
  const { stale, terminal, head } = opts;
  if (stale) {
    if (!terminal || !head) {
      throw new Error("title(): stale requires both `terminal` and `head` SHA inputs");
    }
    return `terminal-stated at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
  }
  return `round ${round}: ${verdict}`;
}

export function summary(body: string, opts: TitleOpts = {}): string {
  const { stale, terminal } = opts;
  if (stale) {
    if (!terminal) {
      throw new Error("summary(): stale requires `terminal` SHA input");
    }
    return `Stale: this category terminal-stated at ${terminal.slice(0, 8)}; the body below is the prior review.\n\n${body}`;
  }
  return body;
}

export function conclude(g: string, c: string): Conclusion {
  if (g === "fail" || c === "fail") return "failure";
  if (g === "pending" || c === "pending") return "action_required";
  if (g === "pass" && c === "pass") return "success";
  return "action_required";
}

// ─── CheckRun: generic primitive ───────────────────────────────────────────

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
 * One Check Run. Encapsulates the create→update lifecycle so consumers
 * don't carry a numeric id between calls.
 *
 * Use `start()` then `complete()` / `cancel()` for the in-progress→completed
 * pattern. Use `submit()` for one-shot completed creations (aggregate /
 * inapplicable / cancellation cleanup hooks).
 */
export class CheckRun {
  private id?: number;

  constructor(
    private readonly github: Github,
    private readonly context: Context,
    private readonly sha: string,
    public readonly displayName: string,
  ) {}

  /** POST a new Check Run in `in_progress` status (default). Returns the id. */
  async start(opts: StartOpts = {}): Promise<number> {
    if (this.id !== undefined) {
      throw new Error(`CheckRun ${this.displayName}: start() called twice on the same instance`);
    }
    const { round = 1, status = "in_progress" } = opts;
    const res = await this.github.rest.checks.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      name: this.displayName,
      head_sha: this.sha,
      status,
      output: {
        title: title(round, "pending"),
        summary: `Check run started for ${this.displayName}`,
      },
    });
    this.id = res.data.id;
    return this.id;
  }

  /** PATCH the started Check Run to a terminal conclusion. Requires `start()` first. */
  async complete(conclusion: Conclusion, opts: CompleteOpts = {}): Promise<void> {
    if (this.id === undefined) {
      throw new Error(`CheckRun ${this.displayName}: complete() called before start()`);
    }
    const t = opts.title ?? title(opts.round ?? 1, opts.verdict ?? conclusion, opts);
    const s = opts.summary ?? summary(opts.body ?? "", opts);
    await this.github.rest.checks.update({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      conclusion,
      output: { title: t, summary: s },
    });
  }

  /** PATCH the started Check Run to `cancelled`. For workflow-cancellation cleanup hooks. */
  async cancel(): Promise<void> {
    if (this.id === undefined) {
      throw new Error(`CheckRun ${this.displayName}: cancel() called before start()`);
    }
    await this.github.rest.checks.update({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      check_run_id: this.id,
      status: "completed",
      conclusion: "cancelled",
      output: {
        title: "cancelled mid-run",
        summary: "Workflow cancelled.",
      },
    });
  }

  /**
   * One-shot: POST a Check Run already in `completed` state. For aggregate
   * and inapplicable flows where the start→complete split adds nothing.
   */
  async submit(conclusion: Conclusion, opts: CompleteOpts = {}): Promise<number> {
    const t = opts.title ?? title(opts.round ?? 1, opts.verdict ?? conclusion, opts);
    const s = opts.summary ?? summary(opts.body ?? "", opts);
    const res = await this.github.rest.checks.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      name: this.displayName,
      head_sha: this.sha,
      status: "completed",
      conclusion,
      output: { title: t, summary: s },
    });
    this.id = res.data.id;
    return this.id;
  }
}

// ─── Phase3Category: domain layer over the catalog ─────────────────────────

/**
 * One Phase-3 review category at a given PR HEAD. Knows the catalog's
 * per-(slug, reviewer) display naming, and exposes domain methods over the
 * generic `CheckRun` primitive.
 */
export class Phase3Category {
  public readonly displayName: string;

  constructor(
    private readonly github: Github,
    private readonly context: Context,
    public readonly slug: string,
    private readonly sha: string,
  ) {
    const cat = SYMBOLS.categories[slug];
    if (!cat) throw new Error(`Unknown category slug: ${slug}`);
    this.displayName = cat.display;
  }

  /** Per-reviewer Check Run factory, named like `Phase 3 / Multi-word symbols (§IX) — gemini`. */
  reviewer(reviewer: string): CheckRun {
    return new CheckRun(
      this.github,
      this.context,
      this.sha,
      `${this.displayName} — ${reviewer}`,
    );
  }

  /** Per-category aggregate Check Run factory, named like `Phase 3 / Multi-word symbols (§IX)`. */
  aggregate(): CheckRun {
    return new CheckRun(this.github, this.context, this.sha, this.displayName);
  }

  /** Submit the per-category aggregate from two reviewer verdicts. One-shot completed. */
  async submit(
    g: string,
    c: string,
    opts: Omit<CompleteOpts, "verdict"> = {},
  ): Promise<void> {
    const conclusion = conclude(g, c);
    const verdict =
      conclusion === "success" ? "pass" : conclusion === "failure" ? "fail" : "pending";
    await this.aggregate().submit(conclusion, { ...opts, verdict });
  }

  /** Mark the category inapplicable to this PR. Posts a single per-category aggregate.
   * `round` defaults to 1 for the typical "diff has no relevant content from the start"
   * case; pass a higher round when the category becomes inapplicable on a later push
   * (e.g., the implementer removed all relevant code in a follow-up commit).
   */
  async markInapplicable(opts: { round?: number } = {}): Promise<void> {
    const { round = 1 } = opts;
    await this.aggregate().submit("success", {
      title: `round ${round}: pass (inapplicable)`,
      summary: "Category not applicable to this PR.",
    });
  }
}
