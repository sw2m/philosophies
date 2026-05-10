// Test-runner detection + file auto-parsing utilities.
//
// detect() — scan repo root for config files, return default test command.
// parse(path) — auto-detect format (JSON/YAML/TOML) and return parsed object.
// query(path, expr) — parse file + evaluate jsonata expression.

import jsonata from "npm:jsonata@^2";
import { parse as yaml } from "jsr:@std/yaml@^1";
import { parse as toml } from "jsr:@std/toml@^1";

async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; }
  catch { return false; }
}

async function has(path: string, pattern: RegExp): Promise<boolean> {
  try { return pattern.test(await Deno.readTextFile(path)); }
  catch { return false; }
}

/** Auto-detect serialization format and parse. Supports JSON, YAML,
 *  TOML, and JSONC. Detection order:
 *  1. Extension (.json/.jsonc → JSON, .yml/.yaml → YAML, .toml → TOML)
 *  2. Content sniffing (leading `{`/`[` → JSON, `[section]` → TOML, else YAML)
 */
export async function parse(path: string): Promise<unknown> {
  const text = await Deno.readTextFile(path);
  const ext = path.split(".").pop()?.toLowerCase();

  if (ext === "json" || ext === "jsonc") {
    // Strip JSONC comments
    const clean = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(clean);
  }
  if (ext === "toml") return toml(text);
  if (ext === "yml" || ext === "yaml") return yaml(text);

  // Content sniff
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.parse(text); } catch {}
  }
  if (/^\[[\w.-]+\]/m.test(trimmed)) {
    try { return toml(text); } catch {}
  }
  // Fallback: YAML (superset of plain text scalars)
  return yaml(text);
}

/** Parse a file (auto-detected format) and evaluate a jsonata expression.
 *  Returns undefined if the path doesn't exist or the expression yields nothing. */
export async function query(path: string, expr: string): Promise<unknown> {
  try {
    const data = await parse(path);
    return await jsonata(expr).evaluate(data);
  } catch {
    return undefined;
  }
}

/** Detect the repo's test command from config files. First match wins. */
export async function detect(): Promise<string | undefined> {
  if (await has("Makefile", /^test:/m)) return "make test";

  if (await exists("package.json") && await query("package.json", "scripts.test")) {
    if (await exists("bun.lockb") || await exists("bun.lock")) return "bun test";
    return "npm test";
  }

  if (await exists("deno.json") || await exists("deno.jsonc")) return "deno test -A";
  if (await exists("pyproject.toml") || await exists("pytest.ini") || await exists("setup.py")) return "pytest";
  if (await exists("Cargo.toml")) return "cargo test";
  if (await exists("go.mod")) return "go test ./...";

  return undefined;
}
