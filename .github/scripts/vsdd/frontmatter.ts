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
//   1. inline kv-marker:     `<!-- vsdd: opt-out-brand -->`
//                            → { vsdd: "opt-out-brand" }
//   2. namespaced block:     `<!-- vsdd: { phase-3: { verdict: pass } } -->`
//                            → { vsdd: { "phase-3": { verdict: "pass" } } }
//   3. field-discrimination: `<!-- {phase: 3, kind: verdict, ...} -->`
//                            → { phase: 3, kind: "verdict", ... }
//
// Consumer pattern:
//
//   import * as frontmatter from "../vsdd/frontmatter.ts";
//   const blocks = frontmatter.parse(body);
//   const phase3 = blocks
//     .map((b) => isMapping(b) ? b.vsdd : undefined)
//     .find((ns) => isMapping(ns) && "phase-3" in ns)
//     ?.["phase-3"];


const OPEN = "<!--";
const CLOSE = "-->";

/** State engine: walks `body` from left to right, pulling out each
 *  well-formed `<!-- ... -->` block and parsing its content as YAML.
 *  Mutable state is the cursor (`pos`) and the accumulator (`blocks`);
 *  pure helpers (`content`, `dedent`, `leading`) live as statics. */
class Parse {
  private body: string;
  private pos = 0;
  private blocks: unknown[] = [];

  constructor(body: string) {
    this.body = body;
  }

  /** Drive the engine to exhaustion and return all parsed blocks. */
  run(): unknown[] {
    while (this.step()) { /* advance */ }
    return this.blocks;
  }

  /** Drive the engine to exhaustion and return parsed blocks PLUS positions.
   *  `start` points at the first char of `<!--`; `end` points at the char
   *  AFTER the closing `-->`. Useful for callers that want to slice the
   *  body between consecutive markers. */
  marks(): Array<{ value: unknown; start: number; end: number }> {
    const out: Array<{ value: unknown; start: number; end: number }> = [];
    let i = 0;
    while (i < this.body.length) {
      const start = this.body.indexOf(OPEN, i);
      if (start === -1) break;
      const closeIdx = this.body.indexOf(CLOSE, start + OPEN.length);
      if (closeIdx === -1) break;
      const end = closeIdx + CLOSE.length;
      i = end;
      const value = Parse.content(this.body.slice(start + OPEN.length, closeIdx));
      if (value !== null && value !== undefined) out.push({ value, start, end });
    }
    return out;
  }

  /** One step: scan from the cursor for the next `<!--...-->`, classify it,
   *  push the parsed value if non-empty, advance the cursor. Returns
   *  false when no further block exists. */
  private step(): boolean {
    const start = this.body.indexOf(OPEN, this.pos);
    if (start === -1) return false;
    let end = this.body.indexOf(CLOSE, start + OPEN.length);
    if (end === -1) end = this.body.length;
    this.pos = end + (end < this.body.length ? CLOSE.length : 0);

    const value = Parse.content(this.body.slice(start + OPEN.length, end));
    if (value !== null && value !== undefined) this.blocks.push(value);
    return true;
  }

  /** Classify the raw text between `<!--` and `-->` as inline or block,
   *  validate the wrapper-line exclusivity rule, and parse as YAML.
   *  Returns null for malformed shapes or empty content. */
  static content(raw: string): unknown {
    if (!raw.includes("\n")) {
      const trimmed = raw.trim();
      return trimmed === "" ? null : serde.parse(trimmed, "yaml");
    }

    const head = raw.indexOf("\n");
    const tail = raw.lastIndexOf("\n");
    if (head >= tail) return null;
    if (raw.slice(0, head).trim() !== "") return null;
    if (raw.slice(tail + 1).trim() !== "") return null;

    const dedented = Parse.dedent(raw.slice(head + 1, tail));
    return dedented === "" ? null : serde.parse(dedented, "yaml");
  }

  /** Strip the leading indentation common to every non-blank line.
   *  Whitespace-only lines are exempt. Throws if any non-blank line has
   *  SHORTER indent than the first non-blank line — that indicates a
   *  broken block, not a YAML structure the parser would silently
   *  mishandle. */
  static dedent(block: string): string {
    const lines = block.split("\n");

    let indent = -1;
    for (const line of lines) {
      if (line.trim() === "") continue;
      indent = Parse.leading(line);
      break;
    }
    if (indent === -1) return "";

    return lines.map((line) => {
      if (line.trim() === "") return "";
      const n = Parse.leading(line);
      if (n < indent) {
        throw new Error(
          `frontmatter: line "${line}" has ${n} leading whitespace chars; first non-blank line had ${indent}`,
        );
      }
      return line.slice(indent);
    }).join("\n");
  }

  /** Count leading space and tab characters on a line. */
  static leading(line: string): number {
    let n = 0;
    while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
    return n;
  }
}

/** Parse every well-formed HTML-comment metadata block in `body`, in source
 *  order. Each block's content is parsed as YAML and pushed to the result.
 *  Blocks whose content is empty (whitespace-only, or empty YAML) are
 *  skipped silently, as are malformed shapes that fit neither inline nor
 *  block form.
 *
 *  Discrimination between blocks (which one is "mine"?) is the caller's
 *  job — filter the returned array by whatever convention the emitter uses. */
export function parse(body: string): unknown[] {
  return new Parse(body).run();
}

/** Parse every well-formed block AND return its position in `body`.
 *  `{value, start, end}` triples in source order; `start` indexes the
 *  first char of `<!--`, `end` indexes the char after the closing `-->`.
 *  Useful for callers that section a body by markers — the slice
 *  `body.slice(prev.end, next.start)` is the prose between two markers. */
export function marks(body: string): Array<{ value: unknown; start: number; end: number }> {
  return new Parse(body).marks();
}
