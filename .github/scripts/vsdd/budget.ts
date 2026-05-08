// Generic round-and-decay budget: 7→5→3→1→0 over consecutive review
// rounds. Pure module (no I/O, no Octokit). Workflow drives the API,
// this module drives the text transform.
//
// Decoupled from any specific phase. Construct with the namespace
// subkey (`phase-1c`, `phase-3`, `ci-meta`, ...) and the reviewer
// slug-set; the same logic applies — count prior `vsdd: { <key>:
// { reviewer: <slug> } }` blocks, demote excess `(blocking)` markers
// past the per-round budget, rewrite the verdict line if all blockers
// got demoted.
//
// Originally bound to Phase 1c (sw2m/philosophies#88, goal #87); the
// per-category Phase 3 split (#167) and any future ci-meta budget will
// reuse this shape.

import { parse as fm } from "./frontmatter.ts";

export const INITIAL = 7;
export const STEP = 2;

/** Structural `(blocking)` marker at the start of a markdown bullet,
 *  optionally backticked. Loose `(blocking)` substrings inside prose,
 *  fenced code blocks, or pseudocode examples are NOT counted. */
export const MARKER = /^(\s*[-*]\s*`?)\(blocking\)(`?)/gim;

/** Verdict line: `_Verdict: \`pass\`_` or `_Verdict: \`fail\`_` on its
 *  own line. */
export const VERDICT = /^_Verdict:\s*`?(pass|fail)`?_\s*$/m;

export type Comment = { body?: string };

export class Budget {
  /** Subkey under the `vsdd:` namespace — `phase-1c`, `phase-3`, etc. */
  key: string;

  constructor(opts: { key: string }) {
    this.key = opts.key;
  }

  /** True iff `body` contains a `vsdd: { <key>: { reviewer: <slug> } }` block. */
  authored(body: string, slug: string): boolean {
    for (const block of fm(body)) {
      if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
      const ns = (block as Record<string, unknown>).vsdd;
      if (typeof ns !== "object" || ns === null || Array.isArray(ns)) continue;
      const inner = (ns as Record<string, unknown>)[this.key];
      if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
      if ((inner as Record<string, unknown>).reviewer === slug) return true;
    }
    return false;
  }

  /** Round the next review will be: 1 + count of prior `comments` whose
   *  body contains a matching block authored by `slug`. */
  round(comments: Comment[], slug: string): number {
    let prior = 0;
    for (const c of comments) {
      if (this.authored(c.body || "", slug)) prior += 1;
    }
    return prior + 1;
  }

  /** Per-round budget: 7 → 5 → 3 → 1 → 0, clamped to non-negative. */
  budget(r: number): number {
    return Math.max(0, INITIAL - STEP * (r - 1));
  }

  /** Demote any structural `(blocking)` markers past `cap` to
   *  `(advisory; over-budget)`. Markers inside fenced code blocks are
   *  skipped. Returns the rewritten body, the count demoted, and the
   *  total marker count seen. */
  demote(body: string, cap: number): { body: string; demoted: number; total: number } {
    const f = fences(body);
    let total = 0;
    let demoted = 0;
    const out = body.replace(MARKER, (match, prefix, suffix, offset) => {
      if (fenced(offset, f)) return match;
      total += 1;
      if (total > cap) {
        demoted += 1;
        return `${prefix}(advisory; over-budget)${suffix}`;
      }
      return match;
    });
    return { body: out, demoted, total };
  }

  /** Count remaining `(blocking)` markers (post-demotion). Markers
   *  inside fenced code blocks are skipped, matching `demote`. */
  count(body: string): number {
    const f = fences(body);
    let n = 0;
    let m: RegExpExecArray | null;
    MARKER.lastIndex = 0;
    while ((m = MARKER.exec(body)) !== null) {
      if (!fenced(m.index, f)) n += 1;
    }
    return n;
  }

  /** Process a reviewer's review.md content for the given round +
   *  budget. Returns the rewritten body, the resolved verdict, and
   *  metadata. */
  process(opts: { body: string; round: number; budget: number }): {
    body: string;
    verdict: "pass" | "fail";
    demoted: number;
    round: number;
    budget: number;
  } {
    const { body: demoted, demoted: ndemoted } = this.demote(opts.body, opts.budget);
    const remaining = this.count(demoted);

    let body = demoted;
    let v: "pass" | "fail";

    const m = body.match(VERDICT);
    if (!m) {
      body = `${body.replace(/\s+$/, "")}\n\n_Verdict: \`fail\`_\n`;
      v = "fail";
    } else if (remaining === 0 && m[1].toLowerCase() === "fail") {
      body = body.replace(VERDICT, "_Verdict: \`pass\`_");
      v = "pass";
    } else {
      v = m[1].toLowerCase() as "pass" | "fail";
    }

    if (ndemoted > 0) {
      const note =
        `_Budget note: round ${opts.round} budget ${opts.budget}; ` +
        `demoted ${ndemoted} blocker(s) to advisory._`;
      body = body.replace(VERDICT, (line) => `${note}\n\n${line}`);
    }

    return { body, verdict: v, demoted: ndemoted, round: opts.round, budget: opts.budget };
  }
}

type Range = [number, number];

function fences(body: string): Range[] {
  const out: Range[] = [];
  const re = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

function fenced(pos: number, ranges: Range[]): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}
