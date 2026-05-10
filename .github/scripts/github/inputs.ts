// Action inputs accessor. Reads INPUT_* env vars that GitHub Actions
// sets for composite action inputs. Provides the same shape as
// core.getInput() but as a module with get/list.
//
// Usage:
//   import * as inputs from "./.github/scripts/github/inputs.ts";
//   const token = inputs.get("github-token");
//   const all = inputs.list();

/** Read an action input by name. Handles the INPUT_<NAME> env var
 *  convention (uppercased, hyphens → underscores). Returns undefined
 *  if not set. */
export function get(name: string): string | undefined {
  const key = `INPUT_${name.toUpperCase().replaceAll("-", "_")}`;
  return Deno.env.get(key);
}

/** List all input names currently set (derived from INPUT_* env vars).
 *  Returns lowercased, hyphen-separated names. */
export function list(): string[] {
  const out: string[] = [];
  for (const key of Object.keys(Deno.env.toObject())) {
    if (key.startsWith("INPUT_")) {
      out.push(key.slice(6).toLowerCase().replaceAll("_", "-"));
    }
  }
  return out.sort();
}
