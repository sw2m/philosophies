// GitHub Actions output helper. Wraps the `key=value\n` append-to-
// $GITHUB_OUTPUT pattern that's repeated across every github-deno
// script and standalone deno-run script in this repo.
//
// Standalone deno-run scripts (e.g. promote/gates.ts) don't have
// `@actions/core` injected, so they can't call `core.setOutput(...)`.
// This module is a runtime-agnostic equivalent.

function path(): string {
  const p = Deno.env.get("GITHUB_OUTPUT");
  if (!p) {
    throw new Error("$GITHUB_OUTPUT is unset — output helpers only run inside a GitHub Actions step");
  }
  return p;
}

/** Append a `name=value\n` line to $GITHUB_OUTPUT. Throws if the env
 *  var isn't set — running outside a GitHub Actions step is almost
 *  always a bug we want surfaced, not silently swallowed. */
export async function set(name: string, value: string | number | boolean): Promise<void> {
  await Deno.writeTextFile(path(), `${name}=${value}\n`, { append: true });
}

/** Re-read $GITHUB_OUTPUT for the LAST `name=...` line that was written
 *  in the current step (append-only, last write wins). Returns the value
 *  or undefined when the name isn't found. Symmetric with set(). */
export async function get(name: string): Promise<string | undefined> {
  let text: string;
  try { text = await Deno.readTextFile(path()); }
  catch { return undefined; }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq) === name) return line.slice(eq + 1);
  }
  return undefined;
}
