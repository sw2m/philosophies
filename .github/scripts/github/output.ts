// GitHub Actions output helper. Wraps the `key=value\n` append-to-
// $GITHUB_OUTPUT pattern that's repeated across every github-deno
// script and standalone deno-run script in this repo.
//
// Standalone deno-run scripts (e.g. promote/gates.ts) don't have
// `@actions/core` injected, so they can't call `core.setOutput(...)`.
// This module is a runtime-agnostic equivalent.

/** Append a `name=value\n` line to $GITHUB_OUTPUT. Throws if the env
 *  var isn't set — running outside a GitHub Actions step is almost
 *  always a bug we want surfaced, not silently swallowed. */
export async function set(name: string, value: string | number | boolean): Promise<void> {
  const path = Deno.env.get("GITHUB_OUTPUT");
  if (!path) {
    throw new Error("$GITHUB_OUTPUT is unset — set() can only run inside a GitHub Actions step");
  }
  await Deno.writeTextFile(path, `${name}=${value}\n`, { append: true });
}
