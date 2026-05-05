#!/usr/bin/env node
// Step 0 — empty-input bypass + canonical JSON parse.
//
// Reads `{proposed, existing}` JSON from stdin (the consolidated input that
// Step 1 also receives). Writes a JSON envelope to stdout with:
//   - bypass: true|false
//   - verdicts (only when bypass=true): parallel-to-proposed, all
//     duplicate_of:null, source:"empty-input"
//
// Malformed JSON / missing fields hard-fail HERE — this is the canonical
// parse point per the tech-spec, so the rest of the pipeline can assume
// clean inputs.

import { detectBypass } from './lib.mjs';

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin();
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`::error::is-empty.mjs: input is not valid JSON: ${err.message}`);
  process.exit(2);
}

let result;
try {
  result = detectBypass(parsed);
} catch (err) {
  console.error(`::error::is-empty.mjs: ${err.message}`);
  process.exit(2);
}

process.stdout.write(JSON.stringify(result));
