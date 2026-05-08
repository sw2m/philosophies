// VSDD brand-state and red-gate-cleared marker helpers (#129 + non-impl
// whitelist). Pure functions; no I/O. Consumed by `vsdd-brand.yml` and
// `non-test-blocker.yml` via the github-deno action.
//
// Replaces .github/scripts/vsdd-brand.js — same public surface, ported
// to TS+Deno and uses `vsdd/frontmatter.ts` for marker detection so all
// HTML-comment metadata flows through one parser.

import { parse as fm } from "./frontmatter.ts";

/** Subkey under `vsdd:` namespace. Inline-form marker:
 *  `<!-- vsdd: red-gate-cleared -->` parses to `{vsdd: "red-gate-cleared"}`. */
export const TOKEN = "red-gate-cleared";

const ROOT_METADATA = new Set([
  ".gitignore",
  ".gitattributes",
  "LICENSE",
  "CODEOWNERS",
]);

/** Predicate: is this changed-file path exempt from VSDD test discipline?
 *  True iff path is under `.github/`, ends in `.md`, or is a recognized
 *  root-level repo-metadata file (`.gitignore`, `LICENSE`, `CODEOWNERS`,
 *  ...). */
export function whitelist(path: unknown): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith(".github/")) return true;
  if (path.endsWith(".md")) return true;
  if (ROOT_METADATA.has(path)) return true;
  if (/^LICENSE(\..+)?$/.test(path)) return true;
  return false;
}

/** Compute brand state from the three input flags. The branded state is
 *  reached when EITHER the changed paths are all whitelisted (no impl
 *  content) OR there's impl content with no earned red-gate-cleared
 *  marker. */
export function branded(
  opts: { whitelist: boolean; impl: boolean; marker: boolean },
): boolean {
  return Boolean(opts.whitelist || (opts.impl && !opts.marker));
}

/** True iff `body` contains a well-formed inline-marker block whose
 *  vsdd-namespace value matches `TOKEN`. Inline form:
 *  `<!-- vsdd: red-gate-cleared -->` parses to `{vsdd: "red-gate-cleared"}`,
 *  so the check is `block.vsdd === TOKEN`. */
export function marked(body: unknown): boolean {
  if (typeof body !== "string" || body.length === 0) return false;
  return fm(body).some((b) => {
    if (typeof b !== "object" || b === null || Array.isArray(b)) return false;
    return (b as Record<string, unknown>).vsdd === TOKEN;
  });
}
