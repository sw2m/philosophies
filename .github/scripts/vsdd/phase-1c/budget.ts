// Phase 1c blocker-budget: round counting, structural-marker demotion,
// verdict rewrite. Pure module (no I/O, no Octokit calls) — workflow drives
// the API and this module drives the text transform, keeping the demote
// logic testable in isolation.
//
// Replaces .github/scripts/phase-1c-budget.js — ported to TS+Deno, swaps
// the per-reviewer regex parser for `vsdd/frontmatter.ts` (#210). The
// frontmatter shape is now kv-discriminated:
//
//   <!--
//   vsdd-phase-1c:
//     reviewer: gemini | claude | orchestrator
//     verdict: pass | fail
//     [subjects: N]
//     [outcomes: N]
//   -->
//
// In-flight migration: legacy `<!-- vsdd-phase-1c\nreviewer:X\n... -->`
// comments do NOT match the new utility's well-formed shapes, so round
// counters reset to 0 for issues with only legacy comments. Force-passes
// from older rounds remain force-passes; no data loss, just a counter
// restart.
//
// Spec: sw2m/philosophies#88. Goal: sw2m/philosophies#87.

import { parse as fm } from "../frontmatter.ts";

export const INITIAL = 7;
export const STEP = 2;

/** Structural `(blocking)` marker at the start of a markdown bullet,
 *  optionally backticked. Loose `(blocking)` substrings inside prose,
 *  fenced code blocks, or pseudocode examples are NOT counted. */
export const MARKER = /^(\s*[-*]\s*`?)\(blocking\)(`?)/gim;

/** Verdict line: `_Verdict: \`pass\`_` or `_Verdict: \`fail\`_` on its
 *  own line. */
export const VERDICT = /^_Verdict:\s*`?(pass|fail)`?_\s*$/m;

const KEY = "vsdd-phase-1c";

export type Reviewer = "gemini" | "claude" | "orchestrator";
export type Comment = { body?: string };

/** True iff `body` contains a `vsdd-phase-1c` block whose `reviewer`
 *  field matches `slug`. */
export function authored(body: string, slug: Reviewer): boolean {
  for (const block of fm(body)) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const inner = (block as Record<string, unknown>)[KEY];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    if ((inner as Record<string, unknown>).reviewer === slug) return true;
  }
  return false;
}

/** Round the next review will be: 1 + count of prior `comments` whose
 *  body contains a `vsdd-phase-1c` block authored by `slug`. */
export function round(comments: Comment[], slug: Reviewer): number {
  let prior = 0;
  for (const c of comments) {
    if (authored(c.body || "", slug)) prior += 1;
  }
  return prior + 1;
}

/** Per-round budget: 7 → 5 → 3 → 1 → 0, clamped to non-negative. */
export function budget(r: number): number {
  return Math.max(0, INITIAL - STEP * (r - 1));
}

type Range = [number, number];

/** Find ``` fenced block ranges so demote/count logic can skip matches
 *  inside them — those are literal demonstrations, not concerns. */
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

/** Demote any structural `(blocking)` markers past `cap` to
 *  `(advisory; over-budget)`. Markers inside fenced code blocks are
 *  skipped. Returns the rewritten body, the count demoted, and the total
 *  marker count seen. */
export function demote(body: string, cap: number): {
  body: string;
  demoted: number;
  total: number;
} {
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

/** Count remaining `(blocking)` markers (post-demotion). Markers inside
 *  fenced code blocks are skipped, matching `demote`. */
export function count(body: string): number {
  const f = fences(body);
  let n = 0;
  let m: RegExpExecArray | null;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(body)) !== null) {
    if (!fenced(m.index, f)) n += 1;
  }
  return n;
}

/** Process a reviewer's review.md content for the given round + budget.
 *  Returns the rewritten body, the resolved verdict, and metadata. */
export function process(
  opts: { body: string; round: number; budget: number },
): { body: string; verdict: "pass" | "fail"; demoted: number; round: number; budget: number } {
  const { body: demoted, demoted: ndemoted } = demote(opts.body, opts.budget);
  const remaining = count(demoted);

  let body = demoted;
  let v: "pass" | "fail";

  const m = body.match(VERDICT);
  if (!m) {
    // No verdict line — append a fail verdict so phase-1c-clearance
    // sees something parseable; preserve the reviewer's prose.
    body = `${body.replace(/\s+$/, "")}\n\n_Verdict: \`fail\`_\n`;
    v = "fail";
  } else if (remaining === 0 && m[1].toLowerCase() === "fail") {
    // Demotion left no blockers; force-pass.
    body = body.replace(VERDICT, "_Verdict: `pass`_");
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
