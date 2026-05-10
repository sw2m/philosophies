// Serialization/deserialization utilities. Auto-detect format from
// extension, content, or explicit hint. JSON → TOML → YAML fallback.
//
// load(path) — read file + auto-deserialize
// parse(content, hint?) — deserialize a string
// query(input, expr) — parse if string, then jsonata

import jsonata from "npm:jsonata@^2";
import { parse as yaml } from "jsr:@std/yaml@^1";
import { parse as toml } from "jsr:@std/toml@^1";

type Format = "json" | "yaml" | "toml";

import { parse as jsonc } from "jsr:@std/jsonc@^1";

function json(text: string): unknown {
  return jsonc(text);
}

function sniff(text: string): unknown {
  const t = text.trimStart();
  // JSON is unambiguous
  if (t.startsWith("{") || t.startsWith("[")) {
    try { return json(text); } catch {}
  }
  // TOML is stricter — if it parses, it's TOML
  try { return toml(text); } catch {}
  // YAML is the superset fallback
  return yaml(text);
}

/** Deserialize a string. If `hint` is given, tries that format first;
 *  on failure falls through to the TOML→YAML best-effort pipe. */
export function parse(content: string, hint?: Format): unknown {
  if (hint) {
    try {
      if (hint === "json") return json(content);
      if (hint === "toml") return toml(content);
      if (hint === "yaml") return yaml(content);
    } catch {}
    // Hint failed — best effort
  }
  return sniff(content);
}

/** Read a file and auto-deserialize. Format detected by extension
 *  first, then content sniffing. */
export async function load(path: string): Promise<unknown> {
  const text = await Deno.readTextFile(path);
  const ext = path.split(".").pop()?.toLowerCase();
  const hint: Format | undefined =
    ext === "json" || ext === "jsonc" ? "json" :
    ext === "toml" ? "toml" :
    ext === "yml" || ext === "yaml" ? "yaml" :
    undefined;
  return parse(text, hint);
}

/** Parse (if string) or use directly (if object), then evaluate a
 *  jsonata expression. Returns undefined on missing path or error. */
export async function query(input: string | unknown, expr: string): Promise<unknown> {
  try {
    const data = typeof input === "string" ? parse(input) : input;
    return await jsonata(expr).evaluate(data);
  } catch {
    return undefined;
  }
}

import { stringify as yamlStringify } from "jsr:@std/yaml@^1";
import { stringify as tomlStringify } from "jsr:@std/toml@^1";

/** Serialize a value to the given format. Default: JSON. */
export function dump(value: unknown, format: Format = "json"): string {
  if (format === "yaml") return yamlStringify(value as Record<string, unknown>);
  if (format === "toml") return tomlStringify(value as Record<string, unknown>);
  return JSON.stringify(value, null, 2);
}
