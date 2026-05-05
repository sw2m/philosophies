#!/usr/bin/env -S deno run
// Step 3 — parse the agent's frontmatter output into structured verdicts.
//
// Deno.args:
//   [0] = path to agent output file
//   [1] = path to {proposed, existing} JSON
//   [2] = path to write the parse result JSON envelope to
//
// On parse success: writes {ok: true, verdicts: [...]} and exits 0.
// On parse failure (no frontmatter, bad shape, multi-match, referential
// integrity violation, etc.): writes {ok: false, reason: ...} and STILL
// exits 0 — Step 4's `if:` condition routes off the envelope's `ok` field,
// not the exit code. Only hard I/O errors exit non-zero.
//
// Permissions required:
//   --allow-read   (read agent-output, input-json)
//   --allow-write  (write result-json)

import { parseAgentOutput } from "./lib.ts";

const [agentOutputFile, inputFile, resultFile] = Deno.args;
if (!agentOutputFile || !inputFile || !resultFile) {
  console.error("::error::parse-output.ts: usage: parse-output.ts <agent-output> <input-json> <result-json>");
  Deno.exit(2);
}

let raw: string;
try {
  raw = Deno.readTextFileSync(agentOutputFile);
} catch (err) {
  Deno.writeTextFileSync(
    resultFile,
    JSON.stringify({ ok: false, reason: `agent output file unreadable: ${(err as Error).message}` }),
  );
  console.log("parse-output: agent output unreadable; result=ok:false");
  Deno.exit(0);
}

const input = JSON.parse(Deno.readTextFileSync(inputFile));
const existingNumbers = new Set<number>(input.existing.map((e: { number: number }) => e.number));
const result = parseAgentOutput(raw, input.proposed, existingNumbers);
Deno.writeTextFileSync(resultFile, JSON.stringify(result));
console.log(`parse-output: ok=${result.ok}${result.ok ? "" : ` reason="${result.reason}"`}`);
