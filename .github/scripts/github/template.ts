// Mustache template loader + renderer. Eliminates the boilerplate:
//   const Mustache = (await import("npm:mustache@^4")).default;
//   const template = await Deno.readTextFile(new URL("./foo.mustache", ...));
//   const body = Mustache.render(template, data);
//
// Usage:
//   import * as template from "./.github/scripts/github/template.ts";
//   const body = await template.render(new URL("./bail.mustache", import.meta.url), data);

import Mustache from "npm:mustache@^4";

/** Load a mustache template from `path` and render with `data`. */
export async function render(
  path: string | URL,
  data: Record<string, unknown>,
): Promise<string> {
  const text = await Deno.readTextFile(path);
  return Mustache.render(text, data);
}
