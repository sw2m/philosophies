// PR-level Phase 3 verdict aggregation (#186 / goal #167 item 13).
//
// Reads the PR comment trail, resolves each of the six category Check states
// from per-(slug, reviewer) verdict comments, and posts a single
// `Phase 3 / Aggregate` Check Run with a strict-AND rollup:
//
//   any fail     → fail        (conclusion: failure)
//   any pending  → pending     (conclusion: action_required)
//   else         → clear       (conclusion: success)
//
// The aggregate Check is a Round — same review-cycle semantics as the
// per-category Check Runs, just one global instance per PR HEAD.
//
// Per-comment frontmatter format follows the canonical schema from #182:
//
//   <!-- vsdd-phase-3
//   category: <slug>
//   reviewer: gemini | claude | applicability
//   verdict: pass | fail | pending
//   reason: <optional>
//   commit-sha: <40-char SHA the review evaluated>
//   round: <N | "pending">
//   retries-exhausted: <true | false | absent>
//   -->
//
// `parseVerdict` and `latestVerdict` here are interim — once #182 lands its
// `vsdd/phase-3/budget.ts` (which formalizes the persistence layer), this
// module's parser should be replaced by an import from there.

import { SYMBOLS } from "../../symbols.ts";
import { Round } from "../round.ts";
import type { Conclusion, OctokitContext } from "../../github/check.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Parsed verdict comment frontmatter. Mirrors #182's canonical schema. */
export interface Verdict {
  category: string;
  reviewer: string;
  verdict: "pass" | "fail" | "pending";
  reason?: string;
  commitSha: string;
  round: number | "pending";
  retriesExhausted: boolean;
}

/** Per-category resolved state. Values come from `SYMBOLS["phase-3-states"].category`
 *  in the catalog (one of: `fail`, `pending`, `content-pass`, `inapplicable-pass`,
 *  `stale-pass`). Typed as `string` here per the catalog-over-narrow-types policy. */
export interface ResolvedCategory {
  slug: string;
  state: string;
  /** Diagnostic note for surface-level reporting (e.g., "BUG: empty verdict"). */
  annotation?: string;
}

/** PR-level rollup state. Values come from `SYMBOLS["phase-3-states"].aggregate`
 *  in the catalog (one of: `fail`, `pending`, `clear`). */
export interface AggregateResult {
  state: string;
  states: ResolvedCategory[];
}

interface CommentLike {
  body: string;
  created_at: string;
  user?: { login?: string } | null;
}

const SLUGS = Object.keys(SYMBOLS.categories);

/**
 * PR-level Phase 3 aggregator. Inherits Round so the canonical Check Run
 * (`Phase 3 / Aggregate`) goes through the same lifecycle path as per-
 * category Checks. Pure resolution / aggregation logic lives as static
 * methods; the instance method `run()` is the I/O boundary.
 */
export class Aggregate extends Round {
  /** Canonical slug list — the six Phase-3 categories from the catalog. */
  static readonly slugs = SLUGS;

  /** Parse the canonical Phase-3 frontmatter from a comment body.
   *  Returns null if the body lacks the frontmatter or required fields. */
  static parseVerdict(body: string): Verdict | null {
    const match = body.match(/^<!--\s*vsdd-phase-3\s*\n([\s\S]*?)\n\s*-->/);
    if (!match) return null;
    const fields: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
      const m = line.match(/^\s*([\w-]+):\s*(.*?)\s*$/);
      if (m) fields[m[1]] = m[2];
    }
    const v = fields["verdict"];
    if (!fields["category"] || !fields["reviewer"] || !fields["commit-sha"] ||
        (v !== "pass" && v !== "fail" && v !== "pending")) {
      return null;
    }
    const round = fields["round"];
    return {
      category: fields["category"],
      reviewer: fields["reviewer"],
      verdict: v,
      reason: fields["reason"] || undefined,
      commitSha: fields["commit-sha"],
      round: round === "pending" ? "pending" : parseInt(round, 10),
      retriesExhausted: fields["retries-exhausted"] === "true",
    };
  }

  /** Most recent verdict from `github-actions[bot]` matching (slug, reviewer).
   *  Returns null if no matching comment exists. */
  static latestVerdict(
    comments: CommentLike[],
    slug: string,
    reviewer: string,
  ): Verdict | null {
    const matches = comments
      .filter((c) => c.user?.login === "github-actions[bot]")
      .map((c) => ({ when: c.created_at, parsed: Aggregate.parseVerdict(c.body) }))
      .filter((c): c is { when: string; parsed: Verdict } =>
        c.parsed !== null && c.parsed.category === slug && c.parsed.reviewer === reviewer
      )
      .sort((a, b) => a.when.localeCompare(b.when));
    return matches.length === 0 ? null : matches[matches.length - 1].parsed;
  }

  /** Resolve a single category's state from the comment trail. Precedence
   *  order matters — see goal #167 / #186's spec for derivation. */
  static resolve(
    comments: CommentLike[],
    slug: string,
    prHead: string,
  ): ResolvedCategory {
    const ag = Aggregate.latestVerdict(comments, slug, "gemini");
    const ac = Aggregate.latestVerdict(comments, slug, "claude");
    const ap = Aggregate.latestVerdict(comments, slug, "applicability");

    // 1. Current-HEAD applicability inapplicable → pass.
    if (ap && ap.commitSha === prHead && ap.verdict === "pass" && ap.reason === "inapplicable") {
      return { slug, state: "inapplicable-pass" };
    }

    // 2. Either reviewer fail at current HEAD → category fail. CHECKED BEFORE PASS.
    if ((ag && ag.commitSha === prHead && ag.verdict === "fail") ||
        (ac && ac.commitSha === prHead && ac.verdict === "fail")) {
      return { slug, state: "fail" };
    }

    // 3. Either reviewer pending → category pending.
    if ((ag && ag.verdict === "pending") || (ac && ac.verdict === "pending")) {
      return { slug, state: "pending" };
    }

    // 4. Both reviewers pass at current HEAD → content-pass.
    if (ag && ac && ag.commitSha === prHead && ac.commitSha === prHead &&
        ag.verdict === "pass" && ac.verdict === "pass") {
      return { slug, state: "content-pass" };
    }

    // 5. Both reviewers terminal-state pass at a PRIOR SHA → stale-pass.
    if (ag && ac && ag.verdict === "pass" && ac.verdict === "pass") {
      return { slug, state: "stale-pass" };
    }

    // Prior fail at any SHA → still fail. (Prior-fail does NOT silently cast
    // to stale-pass — security guard per #186 spec round 2.)
    if ((ag && ag.verdict === "fail") || (ac && ac.verdict === "fail")) {
      return { slug, state: "fail" };
    }

    // 6. No verdicts at all (job didn't run, infra failure, fresh PR) → pending.
    return { slug, state: "pending", annotation: `BUG: empty verdict for slug=${slug}` };
  }

  /** Roll up six per-category states into one PR-level state.
   *  fail-precedence over pending-precedence over clear. */
  static aggregate(states: ResolvedCategory[]): string {
    if (states.some((s) => s.state === "fail")) return "fail";
    if (states.some((s) => s.state === "pending")) return "pending";
    return "clear";
  }

  /** Map an aggregate state to its Check Run conclusion. */
  static conclusion(state: string): Conclusion {
    return state === "clear" ? "success"
      : state === "fail" ? "failure"
      : "action_required";
  }

  constructor(api: OctokitContext, head_sha: string) {
    super(api, head_sha, SYMBOLS["aggregate-checkrun"]);
  }

  /** Effectful boundary: fetch the PR's comment trail, resolve each of the
   *  six categories, aggregate, post the `Phase 3 / Aggregate` Check Run.
   *  Returns the resolved state for the workflow's downstream visibility. */
  async run(pr_number: number): Promise<AggregateResult> {
    const comments = await this.api.github.paginate(
      this.api.github.rest.issues.listComments,
      {
        owner: this.api.context.repo.owner,
        repo: this.api.context.repo.repo,
        issue_number: pr_number,
        per_page: 100,
      },
    ) as CommentLike[];

    const states = SLUGS.map((slug) => Aggregate.resolve(comments, slug, this.head_sha));
    const state = Aggregate.aggregate(states);

    const counts = {
      applicable: states.filter((s) => s.state !== "inapplicable-pass").length,
      pending: states.filter((s) => s.state === "pending").length,
      fail: states.filter((s) => s.state === "fail").length,
    };

    await this.submit({
      conclusion: Aggregate.conclusion(state),
      output: {
        title: `Phase 3: ${state} (${counts.applicable} applicable, ${counts.pending} pending, ${counts.fail} fail)`,
        summary: buildMarkdownTable(states),
      },
    });

    return { state, states };
  }
}

function buildMarkdownTable(states: ResolvedCategory[]): string {
  let md = "| Category | State |\n|---|---|\n";
  for (const s of states) {
    const cat = SYMBOLS.categories[s.slug];
    const display = cat ? cat.display : s.slug;
    const note = s.annotation ? ` _(${s.annotation})_` : "";
    md += `| ${display} | ${s.state}${note} |\n`;
  }
  return md;
}
