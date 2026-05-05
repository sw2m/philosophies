#!/usr/bin/env -S deno run
// Step 4 — title-exact fallback. Single `gh issue list` call, in-memory
// match. No `--search` (which would interpolate user-controlled titles
// into GitHub's search syntax); the pure helper filters client-side.
//
// Deno.args:
//   [0] = path to {proposed, existing} JSON
//   [1] = path to write the fallback verdicts JSON envelope
//
// Hard-fails (exits 1) if `gh` errors. Per the failure-mode contract,
// no graceful degrade — partial fallback could silently lose the
// active-remediation signal.
//
// Permissions required:
//   --allow-read         (read input-json)
//   --allow-write        (write result-json)
//   --allow-run=gh       (invoke `gh issue list`)
//   --allow-env=GH_TOKEN (gh CLI reads GH_TOKEN for auth)

import { extractMatches } from "./lib.ts";

const [inputFile, resultFile] = Deno.args;
if (!inputFile || !resultFile) {
  console.error("::error::fallback-search.ts: usage: fallback-search.ts <input-json> <result-json>");
  Deno.exit(2);
}

const input = JSON.parse(Deno.readTextFileSync(inputFile));

// One call, fetch up to 200 open issues with title+number. The 200 cap
// matches `gh issue list --limit 200` used by ci-meta.yml's prep-dedup
// step; if the workload outgrows it, raise in lockstep.
const cmd = new Deno.Command("gh", {
  args: ["issue", "list", "--state", "open", "--limit", "200", "--json", "number,title"],
  stdout: "piped",
  stderr: "piped",
});
const { code, stdout, stderr } = cmd.outputSync();
if (code !== 0) {
  console.error("::error::fallback-search.ts: gh issue list failed");
  if (stderr.length > 0) console.error(new TextDecoder().decode(stderr));
  Deno.exit(1);
}

let ghResponse: unknown;
try {
  ghResponse = JSON.parse(new TextDecoder().decode(stdout));
} catch (err) {
  console.error(`::error::fallback-search.ts: gh output is not valid JSON: ${(err as Error).message}`);
  Deno.exit(1);
}

const verdicts = extractMatches(input.proposed, ghResponse);
Deno.writeTextFileSync(resultFile, JSON.stringify({ verdicts }));
const matched = verdicts.filter((v) => v.duplicate_of !== null).length;
console.log(`fallback-search: ${matched}/${verdicts.length} title-exact matches against ${(ghResponse as unknown[]).length} open issues`);
