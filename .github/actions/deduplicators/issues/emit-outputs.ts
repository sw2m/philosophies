#!/usr/bin/env -S deno run
// Step 5 — compose the final action outputs from whichever upstream
// produced verdicts (bypass / parse / fallback) and append them to
// $GITHUB_OUTPUT.
//
// Deno.args:
//   [0] = path to bypass result JSON (always exists; may have bypass:false)
//   [1] = path to parse result JSON   (may be missing if bypass=true)
//   [2] = path to fallback verdicts JSON (may be missing if parse=ok)
//
// Permissions required:
//   --allow-read           (read upstream result files)
//   --allow-write          (append to $GITHUB_OUTPUT)
//   --allow-env=GITHUB_OUTPUT

import { composeOutput } from "./lib.ts";

const [bypassFile, parseFile, fallbackFile] = Deno.args;
if (!bypassFile) {
  console.error("::error::emit-outputs.ts: usage: emit-outputs.ts <bypass> [<parse>] [<fallback>]");
  Deno.exit(2);
}

function readJsonIfExists(p: string | undefined): unknown {
  if (!p) return null;
  try {
    return JSON.parse(Deno.readTextFileSync(p));
  } catch {
    return null;
  }
}

const bypassResult = readJsonIfExists(bypassFile) as ReturnType<typeof readJsonIfExists>;
const parseResult = readJsonIfExists(parseFile);
const fallbackEnvelope = readJsonIfExists(fallbackFile) as { verdicts?: unknown } | null;
const fallbackResult = (fallbackEnvelope?.verdicts as unknown) ?? null;

let result;
try {
  // deno-lint-ignore no-explicit-any
  result = composeOutput({ bypassResult: bypassResult as any, parseResult: parseResult as any, fallbackResult: fallbackResult as any });
} catch (err) {
  console.error(`::error::emit-outputs.ts: ${(err as Error).message}`);
  Deno.exit(1);
}

const ghOutput = Deno.env.get("GITHUB_OUTPUT");
if (!ghOutput) {
  console.error("::error::emit-outputs.ts: GITHUB_OUTPUT env var not set");
  Deno.exit(2);
}

const verdictsJson = JSON.stringify(result.verdicts);
const block = `verdicts-json<<__EOF__\n${verdictsJson}\n__EOF__\nagent-source=${result.source}\n`;
// `Deno.writeTextFileSync(... { append: true })` is the documented way to
// append; equivalent to Node's appendFileSync.
Deno.writeTextFileSync(ghOutput, block, { append: true });
console.log(`emit-outputs: source=${result.source}, ${result.verdicts.length} verdict(s)`);
