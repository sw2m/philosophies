// Phase 2 (promote-tech-to-pr) agent-output frontmatter parser. Reads an
// agent response file, finds the `vsdd: { phase-2: ... }` block,
// and emits a JSON metadata side-file the bash caller iterates over.
//
// Replaces .github/scripts/parse-phase2-frontmatter.py — ported to
// TS+Deno, drops the legacy YAML `---\n...\n---` pathway in favor of
// HTML-comment frontmatter (#210 unified parser). Agent prompt instructs
// the namespaced shape:
//
//   <!--
//   vsdd:
//     phase-2:
//       new_test_files: [...]
//       new_test_command: "..."
//       regression_test_command: "..."
//   -->
//
// CLI: `vsdd/phase-2/frontmatter.ts <agent-output-file> [<meta-out-path>]`
//
// Writes:
//   - <meta-out-path> (default `phase2-meta.json` in cwd) — JSON object
//     `{files: string[], "red-green": string, regression: string}`
//   - prints each file path on stdout, one per line, so the bash caller
//     can iterate or verify non-emptiness
//
// Exits 0 on success; non-zero with a stderr message on parse failure.
// The action.yml wires the meta-out-path to `${RUNNER_TEMP}/phase2-meta.json`
// so the file isn't swept by Phase 4's `git add .` (#65).

import { parse as fm } from "../frontmatter.ts";

const KEY = "phase-2";  // subkey under vsdd: namespace

type Meta = { files: string[]; "red-green": string; regression: string };

export function read(raw: string): Meta | null {
  // Walk in source order; the agent emits the metadata block at the END
  // of its response (it uses tools first, summarizes after). Last
  // matching block wins.
  let hit: Record<string, unknown> | null = null;
  for (const block of fm(raw)) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const ns = (block as Record<string, unknown>).vsdd;
    if (typeof ns !== "object" || ns === null || Array.isArray(ns)) continue;
    const inner = (ns as Record<string, unknown>)[KEY];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
    hit = inner as Record<string, unknown>;
  }
  if (!hit) return null;

  const files = hit.files;
  if (!Array.isArray(files) || !files.every((f) => typeof f === "string")) return null;
  const rg = typeof hit["red-green"] === "string" ? hit["red-green"] as string : "";
  const reg = typeof hit.regression === "string" ? hit.regression as string : "";
  return { files: files as string[], "red-green": rg, regression: reg };
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

