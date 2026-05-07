// Phase-3 review category — domain layer over the catalog (#202) and the
// generic `Check` primitive (./check.ts).
//
// One `Phase3Category` instance per (slug, sha) pair. Knows the
// `SYMBOLS.categories[slug].display` naming convention and the per-category
// review-cycle operations: per-reviewer Checks, per-category aggregate,
// inapplicable auto-pass, two-reviewer verdict aggregation.

import { SYMBOLS } from "../symbols.ts";
import { Check, type CompleteOpts, type Conclusion } from "../github/check.ts";
import type { context, getOctokit } from "npm:@actions/github@^6";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

/**
 * One Phase-3 review category at a given PR HEAD. Composes `Check` against
 * the catalog's per-(slug, reviewer) display naming.
 */
export class Phase3Category {
  /**
   * Combine two reviewer verdicts (from `gemini` and `claude`) into a single
   * Check Runs `conclusion`. Strict AND for `success`; fail-precedence over
   * pending; conservative for unknown.
   */
  static conclude(g: string, c: string): Conclusion {
    if (g === "fail" || c === "fail") return "failure";
    if (g === "pending" || c === "pending") return "action_required";
    if (g === "pass" && c === "pass") return "success";
    return "action_required";
  }

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

  /** Per-reviewer Check factory, named like `Phase 3 / Multi-word symbols (§IX) — gemini`. */
  reviewer(name: string): Check {
    return new Check(
      this.github,
      this.context,
      this.sha,
      `${this.displayName} — ${name}`,
    );
  }

  /** Per-category aggregate Check factory, named like `Phase 3 / Multi-word symbols (§IX)`. */
  aggregate(): Check {
    return new Check(this.github, this.context, this.sha, this.displayName);
  }

  /** Submit the per-category aggregate from two reviewer verdicts. One-shot completed. */
  async submit(
    g: string,
    c: string,
    opts: Omit<CompleteOpts, "verdict"> = {},
  ): Promise<Check> {
    const conclusion = Phase3Category.conclude(g, c);
    const verdict =
      conclusion === "success" ? "pass" : conclusion === "failure" ? "fail" : "pending";
    return await this.aggregate().submit(conclusion, { ...opts, verdict });
  }

  /** Mark the category inapplicable to this PR. Posts a single per-category aggregate.
   * `round` defaults to 1 for the typical "diff has no relevant content from the start"
   * case; pass a higher round when the category becomes inapplicable on a later push.
   */
  async markInapplicable(opts: { round?: number } = {}): Promise<Check> {
    const { round = 1 } = opts;
    return await this.aggregate().submit("success", {
      title: `round ${round}: pass (inapplicable)`,
      summary: "Category not applicable to this PR.",
    });
  }
}
