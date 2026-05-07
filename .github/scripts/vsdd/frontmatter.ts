// VSDD HTML-comment frontmatter parser. Replaces the per-context regex
// implementations scattered in phase-1c-budget.js, phase-1c-cardinality.js,
// vsdd-brand.js, and aggregate.ts (#186) — all of which parse the same
// canonical block shape but with subtle regex divergence between them.
//
// Three canonical shapes (used across all VSDD machine-readable comments):
//
//   <!-- {token} -->                              (marker; no body)
//   <!-- {token}                                  (multiline; empty body)
//   -->
//   <!-- {token}                                  (multiline; YAML body)
//   {YAML content}
//   -->
//
// The body, when present, is parsed as YAML — supports nested structure,
// scalars typed by YAML semantics (numbers, booleans, nulls), arrays, etc.
// The previous flat-regex parsers stringified everything; consumers
// migrating to this utility may need to adapt to typed values.
//
// Tokens are listed in `symbols.yaml` under `frontmatter-tokens`
// (e.g. `vsdd-phase-1c`, `vsdd-phase-3`, `vsdd-opt-out-brand`,
// `vsdd-canonical`). Callers pass the literal token; the parser captures
// it via the singleton regex below and filters by string match.
//
// Consumers import as a namespace:
//
//   import * as frontmatter from "../vsdd/frontmatter.ts";
//   const fields = frontmatter.parse("vsdd-phase-3", body);
//   const all = frontmatter.find("vsdd-phase-1c", body);

import { parse as parseYAML } from "jsr:@std/yaml@^1";

/** Singleton regex matching ALL `<!-- {token} ... -->` blocks in a body.
 *  Capture group 1 is the token; capture group 2 is the YAML body if
 *  present, undefined otherwise (marker-style with no body). */
const FRONTMATTER_RE = /<!--\s*([\w-]+)(?:\s*\n([\s\S]*?)\n)?\s*-->/g;

/** Parse the FIRST frontmatter block matching the given token from a body.
 *  Returns the parsed YAML mapping, or null if no matching block exists.
 *  Marker-style blocks (no body) return an empty mapping `{}`. */
export function parse(token: string, body: string): Record<string, unknown> | null {
  for (const m of body.matchAll(FRONTMATTER_RE)) {
    if (m[1] === token) return parseBlock(m[2]);
  }
  return null;
}

/** Find ALL frontmatter blocks matching the given token in a body, in source
 *  order. Returns an array (possibly empty) of parsed YAML mappings.
 *  Marker-style blocks contribute empty mappings to the array. */
export function find(token: string, body: string): Record<string, unknown>[] {
  return Array.from(body.matchAll(FRONTMATTER_RE))
    .filter((m) => m[1] === token)
    .map((m) => parseBlock(m[2]));
}

/** Dedent the block (strip the leading indentation common to every non-blank
 *  line — typically the first non-blank line's indent), then parse as YAML.
 *  Throws if any non-blank line has SHORTER indentation than the first
 *  non-blank line — that indicates a broken block, not a YAML structure
 *  the parser would silently mishandle.
 *
 *  When `block` is undefined or all-blank, returns an empty mapping. */
function parseBlock(block: string | undefined): Record<string, unknown> {
  if (!block) return {};
  const lines = block.split("\n");

  // Find indent of first non-blank line. If all-blank, return empty mapping.
  let indent = -1;
  for (const line of lines) {
    if (line.trim() === "") continue;
    indent = line.match(/^(\s*)/)![1].length;
    break;
  }
  if (indent === -1) return {};

  // Dedent: strip `indent` leading characters from each non-blank line.
  // Throw if any non-blank line has less leading whitespace than the first.
  const dedented = lines.map((line) => {
    if (line.trim() === "") return "";
    const leading = line.match(/^(\s*)/)![1].length;
    if (leading < indent) {
      throw new Error(
        `frontmatter: line "${line}" has ${leading} leading spaces; first non-blank line had ${indent}`,
      );
    }
    return line.slice(indent);
  });

  const parsed = parseYAML(dedented.join("\n"));
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `frontmatter: YAML content is not a mapping (got ${Array.isArray(parsed) ? "array" : typeof parsed})`,
    );
  }
  return parsed as Record<string, unknown>;
}
