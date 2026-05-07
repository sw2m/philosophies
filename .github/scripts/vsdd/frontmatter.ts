// VSDD HTML-comment frontmatter parser. Replaces the per-context regex
// implementations scattered in phase-1c-budget.js, phase-1c-cardinality.js,
// vsdd-brand.js, and aggregate.ts (#186) — all of which parse the same
// canonical block shape but with subtle regex divergence between them.
//
// Canonical shape (used across all VSDD machine-readable comments):
//
//   <!-- {token}
//   key: value
//   key: value
//   -->
//
// Tokens are listed in `symbols.yaml` under `frontmatter-tokens`
// (e.g. `vsdd-phase-1c`, `vsdd-phase-3`, `vsdd-opt-out-brand`,
// `vsdd-canonical`). This utility takes the literal token string from the
// caller; it doesn't reach into the catalog itself.
//
// Consumers import as a namespace:
//
//   import * as frontmatter from "../vsdd/frontmatter.ts";
//   const fields = frontmatter.parse("vsdd-phase-3", body);
//   const all = frontmatter.find("vsdd-phase-1c", body);

/** Parse the FIRST frontmatter block matching the given token from a body.
 *  Returns the key→value map, or null if no matching block exists.
 *
 *  Field values are trimmed; keys must be `[\w-]+`. Lines that don't match
 *  the `key: value` shape are silently skipped (allows blank lines or
 *  comments inside the block). */
export function parse(token: string, body: string): Record<string, string> | null {
  const re = blockRegex(token, false);
  const match = body.match(re);
  if (!match) return null;
  return parseFields(match[1]);
}

/** Find ALL frontmatter blocks matching the given token in a body, in source
 *  order. Useful when a comment carries multiple structured payloads.
 *  Returns an array (possibly empty) of key→value maps. */
export function find(token: string, body: string): Record<string, string>[] {
  const re = blockRegex(token, true);
  const out: Record<string, string>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(parseFields(m[1]));
  }
  return out;
}

/** Build the regex matching `<!-- {token}\n...\n-->`. Token is regex-escaped
 *  so callers pass plain strings without worrying about metacharacters. */
function blockRegex(token: string, global: boolean): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = global ? "gm" : "m";
  return new RegExp(
    `<!--\\s*${escaped}\\s*\\n([\\s\\S]*?)\\n\\s*-->`,
    flags,
  );
}

/** Parse `key: value` lines from a frontmatter block's interior. */
function parseFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([\w-]+):\s*(.*?)\s*$/);
    if (m) fields[m[1]] = m[2];
  }
  return fields;
}
