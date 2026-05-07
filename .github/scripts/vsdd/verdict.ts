// Phase 3 verdict extractor. Reads an agent response body and pulls the
// kv-discriminated `vsdd-phase-3` block emitted by the agent prompt.
// Replaces .github/scripts/extract-verdict.js — drops the legacy YAML
// `---\n...\n---` paths in favor of the unified HTML-comment frontmatter
// format (#210, #167-family migration).
//
// Agent prompts now instruct emission of:
//
//   <!--
//   vsdd-phase-3:
//     verdict: pass | fail
//     [reviewer: gemini | claude]
//     [...optional fields per #167]
//   -->
//
// (or inline kv form `<!-- vsdd-phase-3: { verdict: pass } -->`). The body
// of the agent response — everything OUTSIDE the kv block — is returned
// alongside the verdict for downstream rendering.
//
// Used by pr-review.yml's gemini-review and claude-review post-steps via
// the github-deno action.

import { parse as fm } from "./frontmatter.ts";

const KEY = "vsdd-phase-3";

export type Verdict = "pass" | "fail";
export type Result = { verdict: Verdict | null; body: string };

/** Pull the `vsdd-phase-3` verdict from `text`. Returns the verdict and
 *  the original text (callers render it; the metadata block is not
 *  stripped — it stays in the comment so downstream consumers can re-read
 *  the per-reviewer metadata). When no verdict can be resolved (empty
 *  body, malformed frontmatter, missing key), returns `{verdict: null,
 *  body: text}`. */
export function extract(text: string): Result {
  for (const block of fm(text)) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const inner = (block as Record<string, unknown>)[KEY];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    const v = (inner as Record<string, unknown>).verdict;
    if (v === "pass" || v === "fail") return { verdict: v, body: text };
  }
  return { verdict: null, body: text };
}
