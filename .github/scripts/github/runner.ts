// Test-runner detection. Uses serde for config file parsing.


async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; }
  catch { return false; }
}

async function has(path: string, pattern: RegExp): Promise<boolean> {
  try { return pattern.test(await Deno.readTextFile(path)); }
  catch { return false; }
}


/** Detect the repo's test command from config files. First match wins. */
export async function detect(): Promise<string | undefined> {
  if (await has("Makefile", /^test:/m)) return "make test";

  if (await exists("package.json") && await serde.query(await serde.load("package.json"), "scripts.test")) {
    if (await exists("bun.lockb") || await exists("bun.lock")) return "bun test";
    return "npm test";
  }

  if (await exists("deno.json") || await exists("deno.jsonc")) return "deno test -A";
  if (await exists("pyproject.toml") || await exists("pytest.ini") || await exists("setup.py")) return "pytest";
  if (await exists("Cargo.toml")) return "cargo test";
  if (await exists("go.mod")) return "go test ./...";

  return undefined;
}
