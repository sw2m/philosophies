// VSDD-flavored Check Run. Adds review-cycle output formatting (round /
// verdict / stale-annotation) on top of the generic `Check` primitive.
//
// VSDD's review-cycle vocabulary spans Phase 1c (issue-side) and Phase 3
// (PR-side); the formatting helpers here are shared. Phase-3-specific
// concerns (the catalog, verdict aggregation across reviewers, slug-aware
// naming) live in `./phase-3-check.ts`.
//
// Input types intersect Octokit's shapes (from `../github/check.ts`) with
// VSDD-vocabulary extras. This keeps the override TS-valid (subclass params
// are supertypes of parent params) AND lets callers drop down to the raw
// Octokit `output` shape if they want — the auto-format logic only fires
// when `output` is not explicitly supplied.

import {
  Check,
  type CompleteInput,
  type StartInput,
  type SubmitInput,
} from "../github/check.ts";

/** SHAs needed for the stale-annotation title/summary shape. */
export interface VSDDStaleOpts {
  /** Set true to render title/summary as a stale-annotation pair.
   *  Requires `terminal` (and for title, `head`) SHAs. */
  stale?: boolean;
  /** SHA of the commit at which the category last terminal-stated. */
  terminal?: string;
  /** Current PR HEAD SHA, for the title's "HEAD <8> not reviewed" half. */
  head?: string;
}

/** VSDD-vocabulary fields shared across start / complete / submit inputs. */
export interface VSDDFormatOpts extends VSDDStaleOpts {
  round?: number;
  verdict?: string;
  body?: string;
}

/** Input for VSDDCheck.start() — Octokit's StartInput intersected with
 *  VSDD-format options. Callers use VSDD vocab (round/verdict/body) to
 *  auto-derive `output`, OR pass `output` directly to bypass formatting. */
export type VSDDStartOpts = StartInput & VSDDFormatOpts;

/** Input for VSDDCheck.complete() — same pattern. `conclusion` required
 *  (inherited from CompleteInput). */
export type VSDDCheckResult = CompleteInput & VSDDFormatOpts;

/** Input for VSDDCheck.submit() — same pattern. `conclusion` required. */
export type VSDDSubmitResult = SubmitInput & VSDDFormatOpts;

/**
 * VSDD-flavored Check. Adds review-cycle output formatting — `start()`,
 * `complete()`, and `submit()` accept VSDD vocabulary (round / verdict /
 * stale-annotation SHAs) and build the Octokit `output` object internally.
 * Caller can pass `output` directly to bypass the auto-format.
 */
export class VSDDCheck extends Check {
  /** Format an `output.title` string. Throws if `stale` is set without the
   *  SHAs it needs. */
  static title(round: number, verdict: string, opts: VSDDStaleOpts = {}): string {
    const { stale, terminal, head } = opts;
    if (stale) {
      if (!terminal || !head) {
        throw new Error("VSDDCheck.title(): stale requires both `terminal` and `head` SHA inputs");
      }
      return `terminal-stated at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
    }
    return `round ${round}: ${verdict}`;
  }

  /** Format an `output.summary` string with optional stale-prefix annotation. */
  static summary(body: string, opts: VSDDStaleOpts = {}): string {
    const { stale, terminal } = opts;
    if (stale) {
      if (!terminal) {
        throw new Error("VSDDCheck.summary(): stale requires `terminal` SHA input");
      }
      return `Stale: this category terminal-stated at ${terminal.slice(0, 8)}; the body below is the prior review.\n\n${body}`;
    }
    return body;
  }

  override async start(opts: VSDDStartOpts = {}): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.start({
      ...rest,
      output: rest.output ?? {
        title: VSDDCheck.title(round ?? 1, verdict ?? "pending", { stale, terminal, head }),
        summary: VSDDCheck.summary(body ?? `Check run started for ${this.name}`, { stale, terminal }),
      },
    });
  }

  override async complete(result: VSDDCheckResult): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = result;
    return super.complete({
      ...rest,
      output: rest.output ?? {
        title: VSDDCheck.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: VSDDCheck.summary(body ?? "", { stale, terminal }),
      },
    });
  }

  override async submit(result: VSDDSubmitResult): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = result;
    return super.submit({
      ...rest,
      output: rest.output ?? {
        title: VSDDCheck.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: VSDDCheck.summary(body ?? "", { stale, terminal }),
      },
    });
  }
}
