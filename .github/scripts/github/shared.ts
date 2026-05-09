// Directory-backed named-input accessor. Complements `output.ts` —
// output writes to $GITHUB_OUTPUT (step-scoped kv); input reads from
// a directory where each file IS a named value (cross-step, any size).
//
// The directory path comes from $GITHUB_SHARED_DIR (set by the calling
// step or composite). If unset, falls back to $RUNNER_TEMP/input.
//
// Callers write inputs (bash):
//   mkdir -p "$GITHUB_SHARED_DIR"
//   cp MEMORY.md "$GITHUB_SHARED_DIR/memory"
//   cat pr.diff > "$GITHUB_SHARED_DIR/diff"
//
// Consumers read inputs (TS):
//   import * as shared from "./.github/scripts/github/shared.ts";
//   const memory = await shared.get("memory");
//   const diff = await shared.get("diff");

function dir(): string {
  return Deno.env.get("GITHUB_SHARED_DIR")
    ?? `${Deno.env.get("RUNNER_TEMP") ?? "/tmp"}/input`;
}

/** Read the named input. Returns undefined if the file doesn't exist. */
async function get(name: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(`${dir()}/${name}`);
  } catch {
    return undefined;
  }
}

/** Write a named input (creates the directory if needed). */
async function set(name: string, value: string): Promise<void> {
  const d = dir();
  await Deno.mkdir(d, { recursive: true });
  await Deno.writeTextFile(`${d}/${name}`, value);
}

/** List every name in the directory. */
async function list(): Promise<string[]> {
  try {
    const out: string[] = [];
    for await (const e of Deno.readDir(dir())) {
      if (e.isFile) out.push(e.name);
    }
    return out.sort();
  } catch {
    return [];
  }
}

export { get, set, list };
