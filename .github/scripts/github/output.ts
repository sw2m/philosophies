// GitHub Actions output helper. Wraps the `key=value\n` append-to-
// $GITHUB_OUTPUT pattern that's repeated across every github-deno
// script and standalone deno-run script in this repo.
//
// Standalone deno-run scripts (e.g. promote/to-pr/gates.ts) don't have
// `@actions/core` injected, so they can't call `core.setOutput(...)`.
// This module is a runtime-agnostic equivalent.

function path(): string {
  const p = Deno.env.get("GITHUB_OUTPUT");
  if (!p) {
    throw new Error("$GITHUB_OUTPUT is unset — output helpers only run inside a GitHub Actions step");
  }
  return p;
}

/** Append a `name=value` (or heredoc-form for multiline) entry to
 *  $GITHUB_OUTPUT. Throws if the env var isn't set — running outside
 *  a GitHub Actions step is almost always a bug we want surfaced.
 *
 *  Multiline values are emitted with the heredoc syntax GitHub Actions
 *  documents:
 *
 *    name<<DELIM
 *    line 1
 *    line 2
 *    DELIM
 *
 *  The delimiter is a UUID-derived random string so it cannot collide
 *  with content in `value`. Single-line values fall through to the
 *  classic `name=value` form. */
export async function set(name: string, value: string | number | boolean): Promise<void> {
  const v = String(value);
  let line: string;
  if (v.includes("\n")) {
    const delim = `eof-${crypto.randomUUID().replaceAll("-", "")}`;
    line = `${name}<<${delim}\n${v}\n${delim}\n`;
  } else {
    line = `${name}=${v}\n`;
  }
  await Deno.writeTextFile(path(), line, { append: true });
}

/** Re-read $GITHUB_OUTPUT for the LAST entry under `name` that was
 *  written in the current step (append-only, last write wins).
 *  Handles both shapes set() emits — single-line `name=value` and the
 *  heredoc `name<<DELIM\n...\nDELIM`. Returns the value or undefined
 *  when the name isn't found. */
export async function get(name: string): Promise<string | undefined> {
  let text: string;
  try { text = await Deno.readTextFile(path()); }
  catch { return undefined; }
  const lines = text.split("\n");
  // Walk forward, tracking the latest matching entry. Last-write-wins.
  let last: string | undefined = undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const eq = line.indexOf("=");
    const lt = line.indexOf("<<");
    if (lt > 0 && line.slice(0, lt) === name) {
      const delim = line.slice(lt + 2);
      const buf: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j] !== delim) {
        buf.push(lines[j]);
        j++;
      }
      last = buf.join("\n");
      i = j + 1;
      continue;
    }
    if (eq > 0 && line.slice(0, eq) === name) {
      last = line.slice(eq + 1);
    }
    i++;
  }
  return last;
}

/** List all output names written in this step. Parses $GITHUB_OUTPUT
 *  for both `name=...` and `name<<DELIM` forms. Returns unique names
 *  in write order (first occurrence). */
export async function list(): Promise<string[]> {
  let text: string;
  try { text = await Deno.readTextFile(path()); }
  catch { return []; }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    const lt = line.indexOf("<<");
    let name: string | undefined;
    if (lt > 0) name = line.slice(0, lt);
    else if (eq > 0) name = line.slice(0, eq);
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
