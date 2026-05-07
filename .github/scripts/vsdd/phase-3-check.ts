// Phase-3 review Check Run. `extends` the VSDD-flavored Check from
// `./check.ts`, which itself extends the generic Check from
// `../github/check.ts`. Adds catalog-aware naming and the two-reviewer
// verdict aggregation specific to Phase 3.
//
// File exports use unprefixed names (`Check`, `VerdictOpts`). Consumers
// alias on import:
//
//   import { Check as Phase3Check } from "../vsdd/phase-3-check.ts";
//
// One Check instance per (head_sha, slug, [reviewerName]) tuple:
//   - reviewerName given     → per-reviewer Check ("Phase 3 / <slug> — <reviewer>")
//   - reviewerName omitted   → per-category aggregate Check ("Phase 3 / <slug>")

import { SYMBOLS } from "../symbols.ts";
import {
  Check as VSDDCheck,
  type VerdictOpts as VSDDVerdictOpts,
} from "./check.ts";
import type { Conclusion, OctokitContext } from "../github/check.ts";

/** Input for `Check.submit()` on Phase-3. Either provide a `conclusion`
 *  directly (per-reviewer flavor, parent shape), OR `gemini` + `claude`
 *  reviewer verdicts (aggregate flavor — `Check.conclude` combines them).
 *  All other fields inherit from the VSDD-layer `VerdictOpts`. */
export type VerdictOpts =
  & Omit<VSDDVerdictOpts, "conclusion">
  & {
    conclusion?: Conclusion;
    gemini?: string;
    claude?: string;
  };

/**
 * Phase-3 review Check Run. Knows the catalog (per-slug display names) and
 * verdict aggregation. The slug + optional reviewerName carries enough
 * context — no separate "category" coordinator class needed.
 */
export class Check extends VSDDCheck {
  /** Combine two reviewer verdicts into a Check Runs `conclusion`. Strict
   *  AND for `success`; fail-precedence over pending; conservative for
   *  unknown. */
  static conclude(g: string, c: string): Conclusion {
    if (g === "fail" || c === "fail") return "failure";
    if (g === "pending" || c === "pending") return "action_required";
    if (g === "pass" && c === "pass") return "success";
    return "action_required";
  }

  public readonly slug: string;
  public readonly reviewerName?: string;
  public readonly displayName: string;

  constructor(
    api: OctokitContext,
    head_sha: string,
    slug: string,
    reviewerName?: string,
  ) {
    const cat = SYMBOLS.categories[slug];
    if (!cat) throw new Error(`Unknown category slug: ${slug}`);
    const fullName = reviewerName ? `${cat.display} — ${reviewerName}` : cat.display;
    super(api, head_sha, fullName);
    this.slug = slug;
    this.reviewerName = reviewerName;
    this.displayName = cat.display;
  }

  /** Override `submit` to accept either `{conclusion}` (per-reviewer, parent
   *  shape) or `{gemini, claude}` (aggregate, two-verdict combine). The
   *  widened input type makes this a TS-valid override of the parent's. */
  override async submit(input: VerdictOpts): Promise<this> {
    let conclusion: Conclusion;
    if (input.gemini !== undefined && input.claude !== undefined) {
      if (this.reviewerName !== undefined) {
        throw new Error(`Check ${this.name}: two-verdict submit only valid on the aggregate flavor (reviewerName omitted at construction)`);
      }
      conclusion = Check.conclude(input.gemini, input.claude);
    } else if (input.conclusion !== undefined) {
      conclusion = input.conclusion;
    } else {
      throw new Error(`Check ${this.name}: submit requires either {conclusion} or {gemini, claude}`);
    }

    const { gemini: _g, claude: _c, conclusion: _cc, ...rest } = input;
    const verdict = rest.verdict ?? (
      conclusion === "success" ? "pass"
        : conclusion === "failure" ? "fail" : "pending"
    );

    return super.submit({ ...rest, conclusion, verdict });
  }

  /** Mark the category inapplicable to this PR. Aggregate-flavor only.
   *  `round` defaults to 1 for the typical "diff has no relevant content
   *  from the start" case; pass higher for later-push inapplicability. */
  async markInapplicable(opts: { round?: number } = {}): Promise<this> {
    if (this.reviewerName !== undefined) {
      throw new Error(`Check ${this.name}: markInapplicable only valid on the aggregate flavor`);
    }
    const { round = 1 } = opts;
    return this.submit({
      conclusion: "success",
      output: {
        title: `round ${round}: pass (inapplicable)`,
        summary: "Category not applicable to this PR.",
      },
    });
  }
}
