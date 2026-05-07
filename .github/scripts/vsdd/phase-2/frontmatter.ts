// Phase 2 (promote-tech-to-pr) agent-output frontmatter parser. Reads an
// agent response file, finds the `vsdd-phase-2` kv-discriminated block,
// and emits a JSON metadata side-file the bash caller iterates over.
//
// Replaces .github/scripts/parse-phase2-frontmatter.py — ported to
// TS+Deno, drops the legacy YAML `---\n...\n---` pathway in favor of
// HTML-comment frontmatter (#210 unified parser). Agent prompt instructs
// the new shape:
//
//   <!--
//   vsdd-phase-2:
//     new_test_files: [...]
//     new_test_command: "..."
//     regression_test_command: "..."
//   -->
//
// CLI: `vsdd/phase-2/frontmatter.ts <agent-output-file> [<meta-out-path>]`
//
// Writes:
//   - <meta-out-path> (default `phase2-meta.json` in cwd) — JSON object
//     `{files: string[], new_cmd: string, reg_cmd: string}`
//   - prints each file path on stdout, one per line, so the bash caller
//     can iterate or verify non-emptiness
//
// Exits 0 on success; non-zero with a stderr message on parse failure.
// The action.yml wires the meta-out-path to `${RUNNER_TEMP}/phase2-meta.json`
// so the file isn't swept by Phase 4's `git add .` (#65).

import { parse as fm } from "../frontmatter.ts";

const KEY = "vsdd-phase-2";

type Meta = { files: string[]; new_cmd: string; reg_cmd: string };

function read(raw: string): Meta | null {
  // Walk in source order; the agent emits the metadata block at the END
  // of its response (it uses tools first, summarizes after). Last
  // matching block wins.
  let hit: Record<string, unknown> | null = null;
  for (const block of fm(raw)) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const inner = (block as Record<string, unknown>)[KEY];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    hit = inner as Record<string, unknown>;
  }
  if (!hit) return null;

  const files = hit.new_test_files;
  if (!Array.isArray(files) || !files.every((f) => typeof f === "string")) return null;
  const newCmd = typeof hit.new_test_command === "string" ? hit.new_test_command : "";
  const regCmd = typeof hit.regression_test_command === "string" ? hit.regression_test_command : "";
  return { files: files as string[], new_cmd: newCmd, reg_cmd: regCmd };
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1 || args.length > 2) {
    console.error("usage: frontmatter.ts <phase2-output-file> [<meta-out-path>]");
    Deno.exit(2);
  }
  const inPath = args[0];
  const outPath = args[1] ?? "phase2-meta.json";

  const raw = await Deno.readTextFile(inPath);
  const meta = read(raw);
  if (!meta) {
    console.error(`no '${KEY}' frontmatter block found in agent output (or fields invalid)`);
    Deno.exit(1);
  }

  await Deno.writeTextFile(outPath, JSON.stringify(meta));
  for (const p of meta.files) console.log(p);
}

export { read };
