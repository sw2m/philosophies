// VSDD HTML-comment frontmatter parser. Replaces the per-context regex
// implementations scattered in phase-1c-budget.js, phase-1c-cardinality.js,
// vsdd-brand.js, and aggregate.ts (#186) — all of which parse near-identical
// block shapes with subtle regex divergence between them.
//
// Two canonical shapes (HTML comment IS the marker — no header tokens):
//
//   <!-- ...content on same line... -->         (inline; whole match on one line)
//   <!--                                        (block; wrappers alone on their lines)
//   ...content lines...
//   -->
//
// The wrappers themselves are exclusive: `<!--` may only have non-whitespace
// after it on a line that ALSO has `-->`; same for `-->`. Mixed shapes like
//   <!-- token
//   body
//   -->
// silently do NOT match — neither inline nor block — and are ignored.
//
// Content is parsed as YAML. Inline form parses any one-line YAML value
// (string scalar, flow-array `[a, b]`, flow-mapping `{a: 1}`); block form
// parses multiline YAML (typically a mapping). Discrimination between
// blocks is the caller's job — typically one of:
//
//   1. inline marker scalar: `<!-- vsdd-opt-out-brand -->` → "vsdd-opt-out-brand"
//   2. kv-discrimination:    `<!-- vsdd-phase-3: { state: clear } -->`
//                            → { "vsdd-phase-3": { state: "clear" } }
//   3. field-discrimination: `<!-- {phase: 3, kind: verdict, ...} -->`
//                            → { phase: 3, kind: "verdict", ... }
//
// Consumer pattern:
//
//   import * as frontmatter from "../vsdd/frontmatter.ts";
//   const blocks = frontmatter.parse(body);
//   const verdict = blocks.find(
//     (b) => isMapping(b) && "vsdd-phase-3-aggregate" in b,
//   )?.["vsdd-phase-3-aggregate"];

import { parse as parseYAML } from "jsr:@std/yaml@^1";

/** Singleton regex matching every well-formed `<!-- ... -->` block in a body.
 *
 *  Two alternatives, two capture groups:
 *  - Group 1 (block form): wrapper-line whitespace must be tab/space only
 *    (excluding `\n`), forcing `<!--` and `-->` each to sit alone on their
 *    line. Content is non-empty (`+?` lazy).
 *  - Group 2 (inline form): content contains no newlines, forcing the
 *    entire match onto a single line. Non-empty.
 *
 *  Mismatched shapes (e.g., `<!-- foo\n-->`, `<!--\nfoo-->`, `<!---->`)
 *  match neither alternative and are silently skipped. */
const FRONTMATTER_RE = /<!--(?:[ \t]*\n([\s\S]+?)\n[ \t]*|([^\n]+?))-->/g;

/** Parse every well-formed HTML-comment metadata block in `body`, in source
 *  order. Each block's content is parsed as YAML and pushed to the result.
 *  Blocks whose content parses to null/undefined (whitespace-only, empty
 *  YAML document) are skipped silently.
 *
 *  Discrimination between blocks (which one is "mine"?) is the caller's job
 *  — filter the returned array by whatever convention the emitter uses. */
export function parse(body: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of body.matchAll(FRONTMATTER_RE)) {
    const content = m[1] !== undefined ? dedent(m[1]) : m[2].trim();
    if (content === "") continue;
    const value = parseYAML(content);
    if (value !== null && value !== undefined) blocks.push(value);
  }
  return blocks;
}

/** Strip the leading indentation common to every non-blank line in a block.
 *  Whitespace-only lines are exempt (they don't constrain or violate the
 *  indent). Throws if any non-blank line has SHORTER indent than the
 *  first non-blank line — that indicates a broken block, not a YAML
 *  structure the parser would silently mishandle. */
function dedent(block: string): string {
  const lines = block.split("\n");

  let indent = -1;
  for (const line of lines) {
    if (line.trim() === "") continue;
    indent = line.match(/^(\s*)/)![1].length;
    break;
  }
  if (indent === -1) return "";

  return lines.map((line) => {
    if (line.trim() === "") return "";
    const leading = line.match(/^(\s*)/)![1].length;
    if (leading < indent) {
      throw new Error(
        `frontmatter: line "${line}" has ${leading} leading spaces; first non-blank line had ${indent}`,
      );
    }
    return line.slice(indent);
  }).join("\n");
}
