// VSDD review-round Check Run. Adds the review-cycle vocabulary —
// round number, verdict word, body text, terminal-state (stale)
// annotations — on top of the VSDD-flavored Check base in `./check.ts`.
//
// `Round` is the canonical abstraction for any VSDD review that goes
// through the 7-5-3-1-0 budget cycle. Phase 3 (`./phase-3-check.ts`)
// extends Round to add catalog-aware naming and two-reviewer verdict
// aggregation. A future Phase 1c review-round Check would also extend
// Round and inherit the same title/summary formatters.
//
// File exports use unprefixed names; consumers alias on import:
//
//   import { Round } from "../vsdd/round.ts";

import { Check } from "./check.ts";
import type {
  CheckOutput,
  Conclusion,
  StartOpts,
} from "../github/check.ts";

/** SHAs needed for the stale-annotation title/summary shape. */
export interface StaleOpts {
  /** Set true to render title/summary as a stale-annotation pair.
   *  Requires `terminal` (and for title, `head`) SHAs. */
  stale?: boolean;
  /** SHA of the commit at which the category last terminal-stated. */
  terminal?: string;
  /** Current PR HEAD SHA, for the title's "HEAD <8> not reviewed" half. */
  head?: string;
}

/** Round-vocabulary fragment — the round/verdict/body trio that frames a
 *  Check Run's title/summary in VSDD vocabulary. Used by both `RoundOpen`
 *  (start) and `RoundClose` (complete/submit). Doesn't include staleness
 *  fields — those only apply to terminal emissions, not to opening a round. */
export interface VerdictOpts {
  round?: number;
  verdict?: string;
  body?: string;
}

/** Input for `Round.start()` — opens a check at a given round. Octokit-shaped
 *  start options intersected with the VSDD round-vocabulary. Caller passes
 *  `round`/`verdict`/`body` to auto-derive `output.title` / `output.summary`,
 *  or passes `output` directly to bypass the formatter. Stale options are
 *  not accepted: starting a check that's already stale doesn't make sense. */
export type RoundOpen = StartOpts & VerdictOpts;

/** Common shape for a round's terminal-state input — verdict opts + stale
 *  opts + Octokit terminal-state passthroughs. The exported `RoundClose`
 *  is a thin generic over this. */
type BaseRoundClose = VerdictOpts & StaleOpts & {
  conclusion: Conclusion;
  output?: CheckOutput;
  details_url?: string;
  external_id?: string;
};

/** Input for `Round.complete()` and `Round.submit()` — closes a round with a
 *  terminal-state verdict. Both API paths (PATCH and POST) record the same
 *  conceptual shape. The github-layer's PATCH-vs-POST type distinction isn't
 *  preserved here because VSDD users don't typically use the long-tail Octokit
 *  fields (`actions`, `started_at`, etc.); drop down to `BaseCheck.complete()`
 *  / `BaseCheck.submit()` if you need those.
 *
 *  Subclasses that supply a `Concluder` parameter widen the input: conclusion
 *  becomes optional and the Concluder's fields layer in. Phase 3 uses this to
 *  accept either `{conclusion}` (per-reviewer) or `{gemini, claude}` (aggregate).
 *  The `[T] extends [never]` form sidesteps `never`'s distributive behavior so
 *  the default branch resolves cleanly. */
export type RoundClose<Concluder = never> = [Concluder] extends [never]
  ? BaseRoundClose
  : Omit<BaseRoundClose, "conclusion"> & { conclusion?: Conclusion } & Concluder;

/**
 * Review-round Check. Adds review-cycle output formatting on top of the
 * VSDD Check base — `start()`, `complete()`, and `submit()` accept VSDD
 * vocabulary (round / verdict / stale-annotation SHAs) and build the
 * Octokit `output` object internally. Caller can pass `output` directly
 * to bypass the auto-format.
 */
export class Round extends Check {
  /** Format an `output.title` string. Throws if `stale` is set without the
   *  SHAs it needs. */
  static title(round: number, verdict: string, opts: StaleOpts = {}): string {
    const { stale, terminal, head } = opts;
    if (stale) {
      if (!terminal || !head) {
        throw new Error("Round.title(): stale requires both `terminal` and `head` SHA inputs");
      }
      return `Reviews ended at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
    }
    return `round ${round}: ${verdict}`;
  }

  /** Format an `output.summary` string with optional stale-prefix annotation. */
  static summary(body: string, opts: StaleOpts = {}): string {
    const { stale, terminal } = opts;
    if (stale) {
      if (!terminal) {
        throw new Error("Round.summary(): stale requires `terminal` SHA input");
      }
      return `Reviews ended at ${terminal.slice(0, 8)}. The body below is the prior review.\n\n${body}`;
    }
    return body;
  }

  override async start(opts: RoundOpen = {}): Promise<this> {
    const { round, verdict, body, ...rest } = opts;
    return super.start({
      ...rest,
      output: rest.output ?? {
        title: Round.title(round ?? 1, verdict ?? "pending"),
        summary: Round.summary(body ?? `Check run started for ${this.name}`),
      },
    });
  }

  override async complete(opts: RoundClose): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.complete({
      ...rest,
      output: rest.output ?? {
        title: Round.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: Round.summary(body ?? "", { stale, terminal }),
      },
    });
  }

  override async submit(opts: RoundClose): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.submit({
      ...rest,
      output: rest.output ?? {
        title: Round.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: Round.summary(body ?? "", { stale, terminal }),
      },
    });
  }
}
