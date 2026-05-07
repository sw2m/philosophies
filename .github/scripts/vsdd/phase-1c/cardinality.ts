// Phase 1c cardinality: count parsing, classification, per-axis-min
// selection, orchestrator frontmatter generation/parsing. Pure module
// (no I/O).
//
// Replaces .github/scripts/phase-1c-cardinality.js — ported to TS+Deno,
// uses `vsdd/frontmatter.ts` (#210). Emits and consumes the new
// kv-discriminated shape:
//
//   <!--
//   vsdd-phase-1c:
//     reviewer: orchestrator | gemini | claude
//     verdict: pass | fail
//     [subjects: N]
//     [outcomes: N]
//   -->
//
// Spec: sw2m/philosophies#128. Goal: sw2m/philosophies#125.

import { parse as fm } from "../frontmatter.ts";

const KEY = "vsdd-phase-1c";

export type Tuple = { subjects: number; outcomes: number };
export type Reviewer = "gemini" | "claude" | "orchestrator";
export type Comment = { body?: string; user?: { login?: string }; created_at?: string };

/** True iff `value` is a finite integer ≥ 1. Accepts numbers and strings
 *  (parses as decimal). */
export function valid(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  if (!Number.isInteger(n)) return false;
  return n >= 1;
}

/** Pick the single `vsdd-phase-1c` block from `body` whose `reviewer`
 *  field matches `slug`, or null if none. Multiple matching blocks: most
 *  recent (last in source order) wins. */
export function read(body: string, slug: Reviewer):
  & { reviewer: Reviewer; verdict?: string }
  & Partial<Tuple>
  | null {
  const blocks = fm(body);
  let hit: Record<string, unknown> | null = null;
  for (const block of blocks) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const inner = (block as Record<string, unknown>)[KEY];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    const r = (inner as Record<string, unknown>);
    if (r.reviewer !== slug) continue;
    hit = r;
  }
  if (!hit) return null;
  const out: Record<string, unknown> = { reviewer: slug };
  if (typeof hit.verdict === "string") out.verdict = hit.verdict;
  if (valid(hit.subjects)) out.subjects = parseFloat(String(hit.subjects));
  if (valid(hit.outcomes)) out.outcomes = parseFloat(String(hit.outcomes));
  // deno-lint-ignore no-explicit-any
  return out as any;
}

/** Pull a `{subjects, outcomes}` tuple out of a `vsdd-phase-1c` block
 *  with the given `slug`. Returns null when missing or invalid. */
export function tuple(body: string, slug: Reviewer): Tuple | null {
  const r = read(body, slug);
  if (!r) return null;
  if (!valid(r.subjects) || !valid(r.outcomes)) return null;
  return { subjects: r.subjects!, outcomes: r.outcomes! };
}

/** Classify a tuple: `min` is the smaller axis; `single` is true iff
 *  min === 1 (single tech-spec — atomic per §VII). */
export function classify(t: Tuple): { min: number; single: boolean } {
  const min = Math.min(t.subjects, t.outcomes);
  return { min, single: min === 1 };
}

/** Per-axis min of two tuples — used to combine reviewer agreement. */
export function combine(a: Tuple, b: Tuple): Tuple {
  return {
    subjects: Math.min(a.subjects, b.subjects),
    outcomes: Math.min(a.outcomes, b.outcomes),
  };
}

/** Emit the kv-discriminated `vsdd-phase-1c` block for the orchestrator
 *  verdict. `subjects` and `outcomes` are optional (omitted on a
 *  fail-without-tuple). */
export function emit(
  opts: { verdict: "pass" | "fail"; subjects?: number; outcomes?: number },
): string {
  const lines = [
    "<!--",
    `${KEY}:`,
    `  reviewer: orchestrator`,
    `  verdict: ${opts.verdict}`,
  ];
  if (opts.subjects !== undefined) lines.push(`  subjects: ${opts.subjects}`);
  if (opts.outcomes !== undefined) lines.push(`  outcomes: ${opts.outcomes}`);
  lines.push("-->");
  return lines.join("\n");
}

/** Latest gemini + claude tuples from a comment list (newest first
 *  among bot-authored comments). Either side may be null. */
export function tuples(comments: Comment[]): { gemini: Tuple | null; claude: Tuple | null } {
  const bot = comments
    .filter((c) => c.user?.login === "github-actions[bot]")
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

  const out: { gemini: Tuple | null; claude: Tuple | null } = { gemini: null, claude: null };
  for (const slug of ["gemini", "claude"] as const) {
    for (const c of bot) {
      const t = tuple(c.body || "", slug);
      if (t) {
        out[slug] = t;
        break;
      }
    }
  }
  return out;
}
