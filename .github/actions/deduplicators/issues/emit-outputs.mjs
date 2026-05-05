#!/usr/bin/env node
// Step 5 — compose the final action outputs from whichever upstream
// produced verdicts (bypass / parse / fallback) and write them to
// $GITHUB_OUTPUT.
//
// argv:
//   [2] = path to bypass result JSON (always exists; may have bypass:false)
//   [3] = path to parse result JSON   (may be missing if bypass=true)
//   [4] = path to fallback verdicts JSON (may be missing if parse=ok)

import fs from 'node:fs';
import { composeOutput } from './lib.mjs';

const [, , bypassFile, parseFile, fallbackFile] = process.argv;
if (!bypassFile) {
  console.error('::error::emit-outputs.mjs: usage: emit-outputs.mjs <bypass> [<parse>] [<fallback>]');
  process.exit(2);
}

function readJSONIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const bypassResult = readJSONIfExists(bypassFile);
const parseResult = readJSONIfExists(parseFile);
const fallbackEnvelope = readJSONIfExists(fallbackFile);
const fallbackResult = fallbackEnvelope?.verdicts ?? null;

let result;
try {
  result = composeOutput({ bypassResult, parseResult, fallbackResult });
} catch (err) {
  console.error(`::error::emit-outputs.mjs: ${err.message}`);
  process.exit(1);
}

const ghOutput = process.env.GITHUB_OUTPUT;
if (!ghOutput) {
  console.error('::error::emit-outputs.mjs: GITHUB_OUTPUT env var not set');
  process.exit(2);
}

const verdictsJson = JSON.stringify(result.verdicts);
fs.appendFileSync(ghOutput, `verdicts-json<<__EOF__\n${verdictsJson}\n__EOF__\n`);
fs.appendFileSync(ghOutput, `agent-source=${result.source}\n`);
console.log(`emit-outputs: source=${result.source}, ${result.verdicts.length} verdict(s)`);
