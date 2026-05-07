// ci-meta consensus exit-code logic. Pure function — given the aggregated
// PR-scope verdict and the count of newly opened gap issues, decide the
// process exit code.
//
// Replaces .github/scripts/consensus.py — ported to TS+Deno.

export type Verdict = "pass" | "fail";

/** Compute the process exit code from `verdict` and `opened`. Returns 0
 *  iff the verdict is `pass` AND no new gap issues were filed; 1
 *  otherwise. Throws on invalid input rather than silently routing
 *  malformed signals to a green exit. */
export function exit(verdict: Verdict, opened: number): 0 | 1 {
  if (verdict !== "pass" && verdict !== "fail") {
    throw new Error(`verdict must be 'pass' or 'fail', got ${JSON.stringify(verdict)}`);
  }
  if (!Number.isInteger(opened) || opened < 0) {
    throw new Error(`opened must be a non-negative integer, got ${opened}`);
  }
  if (verdict === "fail" || opened > 0) return 1;
  return 0;
}
