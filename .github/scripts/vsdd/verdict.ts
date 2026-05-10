// Phase 3 verdict extractor. Reads an agent response body and pulls the
// `verdict` field out of the `vsdd: { phase-3: ... }` (or `vsdd: { ci-meta:
// ... }`) namespaced block emitted by the agent prompt. Replaces
// .github/scripts/extract-verdict.js — drops the legacy YAML
// `---\n...\n---` paths in favor of the unified HTML-comment frontmatter
// format (#210, #167-family migration).
//
// Agent prompts now instruct emission of:
//
//   <!--
//   vsdd:
//     phase-3:
//       verdict: pass | fail
//       [reviewer: gemini | claude]
//       [...optional fields per #167]
//   -->
//
// (or inline kv form `<!-- vsdd: { phase-3: { verdict: pass } } -->`). The body
// of the agent response — everything OUTSIDE the kv block — is returned
// alongside the verdict for downstream rendering.
//
// Used by pr-review.yml's gemini-review and claude-review post-steps via
// the github-deno action.


export type Verdict = "pass" | "fail";
export type Result = { verdict: Verdict | null; body: string };

/** Pull the verdict from a kv-discriminated frontmatter block under
 *  `vsdd: { <subkey>: { verdict: ... } }` (e.g. `phase-3`, `ci-meta`).
 *  Returns the verdict and the original text — the metadata block is
 *  not stripped, so downstream consumers can re-read per-reviewer
 *  metadata from the same comment. When no verdict can be resolved,
 *  returns `{verdict: null, body: text}`. */
export function extract(text: string, subkey: string): Result {
  for (const block of serde.parse(text, "frontmatter")) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const ns = (block as Record<string, unknown>).vsdd;
    if (typeof ns !== "object" || ns === null || Array.isArray(ns)) continue;
    const inner = (ns as Record<string, unknown>)[subkey];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    const v = (inner as Record<string, unknown>).verdict;
    if (v === "pass" || v === "fail") return { verdict: v, body: text };
  }
  return { verdict: null, body: text };
}
