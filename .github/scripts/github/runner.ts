// Test-runner detection. Scans the repo root for config files and
// returns the default test command. First match wins.
//
// Usage:
//   import * as runner from "./.github/scripts/github/runner.ts";
//   const cmd = await runner.detect();
//   // cmd is "make test" | "bun test" | "npm test" | "deno test -A" | "pytest" | "cargo test" | "go test ./..." | undefined

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function has(path: string, pattern: RegExp): Promise<boolean> {
  try {
    const text = await Deno.readTextFile(path);
    return pattern.test(text);
  } catch {
    return false;
  }
}

async function json(path: string, key: string): Promise<boolean> {
  try {
    const obj = JSON.parse(await Deno.readTextFile(path));
    return obj?.[key] !== undefined;
  } catch {
    return false;
  }
}

/** Detect the repo's test command from config files. Returns the command
 *  string or `undefined` when no runner is recognized. */
export async function detect(): Promise<string | undefined> {
  if (await has("Makefile", /^test:/m)) return "make test";

  if (await exists("package.json") && await json("package.json", "scripts")) {
    const pkg = JSON.parse(await Deno.readTextFile("package.json"));
    if (pkg?.scripts?.test) {
      if (await exists("bun.lockb") || await exists("bun.lock")) return "bun test";
      return "npm test";
    }
  }

  if (await exists("deno.json") || await exists("deno.jsonc")) return "deno test -A";
  if (await exists("pyproject.toml") || await exists("pytest.ini") || await exists("setup.py")) return "pytest";
  if (await exists("Cargo.toml")) return "cargo test";
  if (await exists("go.mod")) return "go test ./...";

  return undefined;
}
