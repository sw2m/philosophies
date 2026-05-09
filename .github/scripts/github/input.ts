// Directory-backed named-input accessor. Complements `output.ts` —
// output writes to $GITHUB_OUTPUT (step-scoped kv); input reads from
// a directory where each file IS a named value (cross-step, any size).
//
// Callers write inputs:
//   mkdir -p $RUNNER_TEMP/agent-input
//   cp MEMORY.md $RUNNER_TEMP/agent-input/memory
//   cat pr.diff > $RUNNER_TEMP/agent-input/diff
//
// Consumers read inputs:
//   import input from "./.github/scripts/github/input.ts";
//   const i = input("$RUNNER_TEMP/agent-input");
//   const memory = await i.get("memory");
//   const diff = await i.get("diff");
//
// No size limit (files on disk). No quoting/escaping headaches.
// Names are filenames — alphanumeric + hyphens recommended.

type Accessor = {
  /** Read the named input. Returns undefined if the file doesn't exist. */
  get(name: string): Promise<string | undefined>;
  /** Write a named input (creates the directory if needed). */
  set(name: string, value: string): Promise<void>;
  /** List every name in the directory. */
  list(): Promise<string[]>;
};

export default function input(dir: string): Accessor {
  return {
    async get(name) {
      try {
        return await Deno.readTextFile(`${dir}/${name}`);
      } catch {
        return undefined;
      }
    },
    async set(name, value) {
      await Deno.mkdir(dir, { recursive: true });
      await Deno.writeTextFile(`${dir}/${name}`, value);
    },
    async list() {
      try {
        const out: string[] = [];
        for await (const e of Deno.readDir(dir)) {
          if (e.isFile) out.push(e.name);
        }
        return out.sort();
      } catch {
        return [];
      }
    },
  };
}
