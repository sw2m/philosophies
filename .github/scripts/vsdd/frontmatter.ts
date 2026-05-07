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

const OPEN = "<!--";
const CLOSE = "-->";

/** Parse every well-formed HTML-comment metadata block in `body`, in source
 *  order. Each block's content is parsed as YAML and pushed to the result.
 *  Blocks whose content is empty (whitespace-only, or empty YAML) are
 *  skipped silently, as are malformed shapes that fit neither inline nor
 *  block form.
 *
 *  Discrimination between blocks (which one is "mine"?) is the caller's
 *  job — filter the returned array by whatever convention the emitter uses. */
export function parse(body: string): unknown[] {
  const blocks: unknown[] = [];
  let i = 0;
  while (i < body.length) {
    const start = body.indexOf(OPEN, i);
    if (start === -1) break;
    const end = body.indexOf(CLOSE, start + OPEN.length);
    if (end === -1) break;
    i = end + CLOSE.length;

    const value = parseContent(body.slice(start + OPEN.length, end));
    if (value !== null && value !== undefined) blocks.push(value);
  }
  return blocks;
}

/** Parse the raw text between `<!--` and `-->`. Determines inline vs. block
 *  form, validates the wrapper-line exclusivity rule, and returns the parsed
 *  YAML value (or null if the shape is malformed or content is empty). */
function parseContent(raw: string): unknown {
  // Inline form: no newlines anywhere between wrappers.
  if (!raw.includes("\n")) {
    const trimmed = raw.trim();
    return trimmed === "" ? null : parseYAML(trimmed);
  }

  // Block form: text between `<!--` and the first newline must be
  // whitespace-only (else content is sharing a line with `<!--`); same
  // for text between the last newline and `-->`. Need at least two
  // newlines so there's room for a body line between them.
  const firstNL = raw.indexOf("\n");
  const lastNL = raw.lastIndexOf("\n");
  if (firstNL >= lastNL) return null;
  if (raw.slice(0, firstNL).trim() !== "") return null;
  if (raw.slice(lastNL + 1).trim() !== "") return null;

  const inner = raw.slice(firstNL + 1, lastNL);
  const dedented = dedent(inner);
  return dedented === "" ? null : parseYAML(dedented);
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
    indent = leadingWS(line);
    break;
  }
  if (indent === -1) return "";

  return lines.map((line) => {
    if (line.trim() === "") return "";
    const leading = leadingWS(line);
    if (leading < indent) {
      throw new Error(
        `frontmatter: line "${line}" has ${leading} leading whitespace chars; first non-blank line had ${indent}`,
      );
    }
    return line.slice(indent);
  }).join("\n");
}

/** Count leading space and tab characters on a line. */
function leadingWS(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}
