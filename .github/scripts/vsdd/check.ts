// VSDD-flavored Check Run. Adds review-cycle output formatting (round /
// verdict / stale-annotation) on top of the generic `Check` primitive.
//
// VSDD's review-cycle vocabulary spans Phase 1c (issue-side) and Phase 3
// (PR-side); the formatting helpers and auto-format overrides live here so
// both phases can share them. Phase-3-specific concerns (the catalog,
// verdict aggregation across reviewers, slug-aware naming) live in
// `./phase-3-check.ts`.

import { Check, type CheckResult, type StartOpts } from "../github/check.ts";

export interface VSDDStaleOpts {
  /** Set true to render the title/summary as a stale-annotation pair.
   *  Requires `terminal` (and for title, `head`) SHAs. */
  stale?: boolean;
  /** SHA of the commit at which the category last terminal-stated. */
  terminal?: string;
  /** Current PR HEAD SHA, for the title's "HEAD <8> not reviewed" half. */
  head?: string;
}

/** Input for VSDDCheck's complete/submit. Adds round/verdict/body fields
 *  that auto-derive title and summary if `title`/`summary` aren't given. */
export interface VSDDCheckResult extends CheckResult, VSDDStaleOpts {
  round?: number;
  verdict?: string;
  body?: string;
}

/** Input for VSDDCheck's start (round-aware default title/summary). */
export interface VSDDStartOpts extends StartOpts, VSDDStaleOpts {
  round?: number;
  verdict?: string;
  body?: string;
}

/**
 * VSDD-flavored Check. Inherits Check's lifecycle; adds VSDD output
 * formatting via static `title()` / `summary()` and auto-format overrides
 * on `start()` / `complete()` / `submit()`.
 *
 * Consumer can pass `round` + `verdict` (and optionally `stale` + SHAs) and
 * the methods derive the title/summary strings. Explicit `title` / `summary`
 * in the input still take precedence — useful for one-off shapes like
 * `markInapplicable`'s "round N: pass (inapplicable)".
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
    return super.start({
      status: opts.status,
      title: opts.title ?? VSDDCheck.title(opts.round ?? 1, opts.verdict ?? "pending", opts),
      summary: opts.summary ?? VSDDCheck.summary(opts.body ?? `Check run started for ${this.name}`, opts),
    });
  }

  override async complete(result: VSDDCheckResult): Promise<this> {
    return super.complete({
      conclusion: result.conclusion,
      title: result.title ?? VSDDCheck.title(result.round ?? 1, result.verdict ?? result.conclusion, result),
      summary: result.summary ?? VSDDCheck.summary(result.body ?? "", result),
    });
  }

  override async submit(result: VSDDCheckResult): Promise<this> {
    return super.submit({
      conclusion: result.conclusion,
      title: result.title ?? VSDDCheck.title(result.round ?? 1, result.verdict ?? result.conclusion, result),
      summary: result.summary ?? VSDDCheck.summary(result.body ?? "", result),
    });
  }
}
