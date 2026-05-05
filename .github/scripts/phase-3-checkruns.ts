// Per-(category, reviewer) Check Runs API helpers for Phase 3 (#181 / #185).
//
// Designed to be `require()`'d from inside a `github-deno` action's `script:`
// input. The caller's user-script gets `github` (Octokit) and `context`
// injected by the runner; this module is the deterministic data plumbing
// over the Check Runs API.
//
// Pure-core / effectful-shell split (§I Phase 1b):
//   - `name`, `conclude`, `title`, `summary` are pure data transforms.
//   - `create`, `update`, `cancel`, `aggregate`, `inapplicable` make API
//     calls and are the I/O boundary.

export const CATEGORIES = {
  "multi-word-symbols": "Phase 3 / Multi-word symbols (§IX)",
  "error-structure": "Phase 3 / Error structure (§IX)",
  "spec-discipline": "Phase 3 / Spec discipline (§VII)",
  "security-surface": "Phase 3 / Security surface (§II)",
  "spec-gaps": "Phase 3 / Spec gaps (§II)",
  "purity-boundary": "Phase 3 / Purity boundary (§II)",
} as const;

export type Slug = keyof typeof CATEGORIES;
export type Reviewer = "gemini" | "claude";
export type Verdict = "pass" | "fail" | "pending";
export type Conclusion = "success" | "failure" | "action_required";

export const GLOBAL_AGGREGATE = "Phase 3 / Aggregate";

export type TitleOpts = {
  stale?: boolean;
  terminal?: string;
  head?: string;
};

export type CreateOpts = {
  round?: number;
  status?: "queued" | "in_progress" | "completed";
};

export type UpdateOpts = TitleOpts & {
  round?: number;
  verdict?: string;
  body?: string;
};

export type AggregateOpts = TitleOpts & {
  round?: number;
  body?: string;
};

// `github` and `context` shapes intentionally use loose `any` here — these
// objects are injected by `actions/github-script` / `github-deno` at runtime
// and have stable enough surface (`github.rest.checks.{create,update}`,
// `context.repo.{owner,repo}`) that adding strict types would mostly chase
// upstream drift. Tighten if/when @octokit/types is pulled in directly.
// deno-lint-ignore no-explicit-any
export type Github = any;
// deno-lint-ignore no-explicit-any
export type Context = any;

export function name(slug: Slug, reviewer: Reviewer | null = null): string {
  const base = CATEGORIES[slug];
  if (!base) throw new Error(`Unknown category slug: ${slug}`);
  return reviewer ? `${base} — ${reviewer}` : base;
}

export function conclude(g: string, c: string): Conclusion {
  if (g === "fail" || c === "fail") return "failure";
  if (g === "pending" || c === "pending") return "action_required";
  if (g === "pass" && c === "pass") return "success";
  return "action_required";
}

export function title(round: number, verdict: string, opts: TitleOpts = {}): string {
  const { stale, terminal, head } = opts;
  if (stale && terminal && head) {
    return `terminal-stated at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
  }
  return `round ${round}: ${verdict}`;
}

export function summary(body: string, opts: TitleOpts = {}): string {
  const { stale, terminal } = opts;
  if (stale && terminal) {
    return `Stale: this category terminal-stated at ${terminal.slice(0, 8)}; the body below is the prior review.\n\n${body}`;
  }
  return body;
}

export async function create(
  github: Github,
  context: Context,
  slug: Slug,
  reviewer: Reviewer,
  sha: string,
  opts: CreateOpts = {},
): Promise<number> {
  const { round = 1, status = "in_progress" } = opts;
  const n = name(slug, reviewer);
  const res = await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status,
    output: {
      title: title(round, "pending"),
      summary: `Check run started for ${n}`,
    },
  });
  return res.data.id;
}

export async function update(
  github: Github,
  context: Context,
  id: number,
  conclusion: Conclusion,
  opts: UpdateOpts = {},
): Promise<void> {
  const { round = 1, verdict, body = "", stale, terminal, head } = opts;
  const t = title(round, verdict ?? conclusion, { stale, terminal, head });
  const s = summary(body, { stale, terminal });
  await github.rest.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    check_run_id: id,
    status: "completed",
    conclusion,
    output: { title: t, summary: s },
  });
}

export async function cancel(
  github: Github,
  context: Context,
  id: number,
  opts: { round?: number } = {},
): Promise<void> {
  const { round = 1 } = opts;
  await github.rest.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    check_run_id: id,
    status: "completed",
    conclusion: "cancelled",
    output: { title: `round ${round}: cancelled mid-run`, summary: "Workflow cancelled." },
  });
}

export async function aggregate(
  github: Github,
  context: Context,
  slug: Slug,
  sha: string,
  g: string,
  c: string,
  opts: AggregateOpts = {},
): Promise<void> {
  const conclusion = conclude(g, c);
  const n = name(slug, null);
  const { round = 1, body = "", stale, terminal, head } = opts;
  const verdict = conclusion === "success" ? "pass" : conclusion === "failure" ? "fail" : "pending";
  const t = title(round, verdict, { stale, terminal, head });
  const s = summary(body, { stale, terminal });
  await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status: "completed",
    conclusion,
    output: { title: t, summary: s },
  });
}

export async function inapplicable(
  github: Github,
  context: Context,
  slug: Slug,
  sha: string,
): Promise<void> {
  const n = name(slug, null);
  await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    output: { title: "round 1: pass (inapplicable)", summary: "Category not applicable to this PR." },
  });
}
