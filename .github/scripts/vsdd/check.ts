// VSDD-flavored Check Run. Adds review-cycle output formatting (round /
// verdict / stale-annotation) on top of the generic Check primitive from
// `../github/check.ts`. Phase-3-specific concerns (the catalog, verdict
// aggregation, slug-aware naming) live in `./phase-3-check.ts`.
//
// File exports use unprefixed names (`Check`, `StartOpts`, `VerdictOpts`,
// etc.). The directory `vsdd/` is the namespace. Consumers importing
// alongside `../github/check.ts` alias on import:
//
//   import { Check as BaseCheck } from "../github/check.ts";
//   import { Check as VSDDCheck } from "../vsdd/check.ts";

import {
  Check as BaseCheck,
  type CheckOutput,
  type Conclusion,
  type StartOpts as BaseStartOpts,
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

/** VSDD-vocabulary fields shared across start / verdict inputs. */
export interface FormatOpts extends StaleOpts {
  round?: number;
  verdict?: string;
  body?: string;
}

/** Input for `Check.start()` — Octokit's StartOpts intersected with VSDD-format
 *  options. Callers use VSDD vocab (round/verdict/body) to auto-derive `output`,
 *  OR pass `output` directly to bypass formatting. */
export type StartOpts = BaseStartOpts & FormatOpts;

/** Unified input for `Check.complete()` and `Check.submit()` at the VSDD layer.
 *  Both API paths (PATCH and POST) record a verdict — same conceptual shape.
 *  The github-layer's PATCH-vs-POST type distinction isn't preserved here
 *  because VSDD users don't typically use the long-tail Octokit fields
 *  (`actions`, `started_at`, etc.); if you need those, drop down to
 *  `BaseCheck.complete()` / `BaseCheck.submit()`. */
export type VerdictOpts = FormatOpts & {
  conclusion: Conclusion;
  output?: CheckOutput;
  details_url?: string;
  external_id?: string;
};

/**
 * VSDD-flavored Check. Adds review-cycle output formatting — `start()`,
 * `complete()`, and `submit()` accept VSDD vocabulary (round / verdict /
 * stale-annotation SHAs) and build the Octokit `output` object internally.
 * Caller can pass `output` directly to bypass the auto-format.
 */
export class Check extends BaseCheck {
  /** Format an `output.title` string. Throws if `stale` is set without the
   *  SHAs it needs. */
  static title(round: number, verdict: string, opts: StaleOpts = {}): string {
    const { stale, terminal, head } = opts;
    if (stale) {
      if (!terminal || !head) {
        throw new Error("Check.title(): stale requires both `terminal` and `head` SHA inputs");
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
        throw new Error("Check.summary(): stale requires `terminal` SHA input");
      }
      return `Reviews ended at ${terminal.slice(0, 8)}. The body below is the prior review.\n\n${body}`;
    }
    return body;
  }

  override async start(opts: StartOpts = {}): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.start({
      ...rest,
      output: rest.output ?? {
        title: Check.title(round ?? 1, verdict ?? "pending", { stale, terminal, head }),
        summary: Check.summary(body ?? `Check run started for ${this.name}`, { stale, terminal }),
      },
    });
  }

  override async complete(opts: VerdictOpts): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.complete({
      ...rest,
      output: rest.output ?? {
        title: Check.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: Check.summary(body ?? "", { stale, terminal }),
      },
    });
  }

  override async submit(opts: VerdictOpts): Promise<this> {
    const { round, verdict, body, stale, terminal, head, ...rest } = opts;
    return super.submit({
      ...rest,
      output: rest.output ?? {
        title: Check.title(round ?? 1, verdict ?? rest.conclusion, { stale, terminal, head }),
        summary: Check.summary(body ?? "", { stale, terminal }),
      },
    });
  }
}
