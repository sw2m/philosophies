// Phase-3 review Check Run. `extends VSDDCheck` so VSDD output formatting
// (round/verdict, stale annotations) carries over; adds catalog-aware
// naming and the two-reviewer verdict aggregation that's specific to
// Phase 3's per-category structure.
//
// One `Phase3Check` instance per (head_sha, slug, [reviewerName]) tuple:
//   - reviewerName given     → per-reviewer Check ("Phase 3 / <slug> — <reviewer>")
//   - reviewerName omitted   → per-category aggregate Check ("Phase 3 / <slug>")
//
// The aggregate flavor accepts `submit({gemini, claude, ...})` to combine
// two reviewer verdicts into the per-category aggregate's conclusion. The
// reviewer flavor uses the inherited `submit({conclusion, ...})` shape.

import { SYMBOLS } from "../symbols.ts";
import {
  VSDDCheck,
  type VSDDCheckResult,
  type VSDDStartOpts,
} from "./check.ts";
import type { Conclusion, OctokitContext } from "../github/check.ts";

/** Input for Phase3Check's `submit`. Either provide a `conclusion` directly
 *  (per-reviewer flavor, inherited Check shape), OR `gemini` + `claude`
 *  reviewer verdicts (aggregate flavor — `Phase3Check.conclude` combines
 *  them). VSDD formatting fields carry over. */
export interface Phase3SubmitInput
  extends Omit<VSDDCheckResult, "conclusion"> {
  conclusion?: Conclusion;
  gemini?: string;
  claude?: string;
}

/**
 * Phase-3 review Check Run. Knows the catalog (per-slug display names)
 * and verdict aggregation. Construct directly — no separate "category"
 * coordinator class needed; the slug + optional reviewerName carries
 * enough context.
 */
export class Phase3Check extends VSDDCheck {
  /** Combine two reviewer verdicts into a Check Runs `conclusion`. Strict AND
   *  for `success`; fail-precedence over pending; conservative for unknown. */
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

  /** Override `submit` to accept either `{conclusion}` or `{gemini, claude}`.
   *  The aggregate flavor combines verdicts via `Phase3Check.conclude`; the
   *  per-reviewer flavor passes through to the inherited shape. */
  override async submit(input: Phase3SubmitInput): Promise<this> {
    let conclusion: Conclusion;
    if (input.gemini !== undefined && input.claude !== undefined) {
      if (this.reviewerName !== undefined) {
        throw new Error(`Phase3Check ${this.name}: two-verdict submit only valid on the aggregate flavor (reviewerName omitted at construction)`);
      }
      conclusion = Phase3Check.conclude(input.gemini, input.claude);
    } else if (input.conclusion !== undefined) {
      conclusion = input.conclusion;
    } else {
      throw new Error(`Phase3Check ${this.name}: submit requires either {conclusion} or {gemini, claude}`);
    }

    const verdict = input.verdict ?? (
      conclusion === "success" ? "pass"
        : conclusion === "failure" ? "fail" : "pending"
    );

    return super.submit({ ...input, conclusion, verdict });
  }

  /** Mark the category inapplicable to this PR. Aggregate-flavor only.
   *  `round` defaults to 1 for the typical "diff has no relevant content
   *  from the start" case; pass higher for later-push inapplicability. */
  async markInapplicable(opts: { round?: number } = {}): Promise<this> {
    if (this.reviewerName !== undefined) {
      throw new Error(`Phase3Check ${this.name}: markInapplicable only valid on the aggregate flavor`);
    }
    const { round = 1 } = opts;
    return this.submit({
      conclusion: "success",
      title: `round ${round}: pass (inapplicable)`,
      summary: "Category not applicable to this PR.",
    });
  }
}

// Re-export so consumers who only import phase-3-check.ts can also reach
// the start opts type without a second import line.
export type { VSDDStartOpts as Phase3StartOpts };
