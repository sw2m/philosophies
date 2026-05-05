#!/usr/bin/env node
// Step 3 — parse the agent's frontmatter output into structured verdicts.
//
// argv:
//   [2] = path to agent output file
//   [3] = path to {proposed, existing} JSON (the same input the action received)
//   [4] = path to write the parse result JSON envelope to
//
// On parse success: writes {ok: true, verdicts: [...]} and exits 0.
// On parse failure (no frontmatter, bad shape, multi-match, referential
// integrity violation, etc.): writes {ok: false, reason: ...} and STILL
// exits 0 — the action's `if:` condition on Step 4 routes to fallback
// based on the envelope's `ok` field, not the exit code.
// Only hard I/O errors (missing files, etc.) exit non-zero.

import fs from 'node:fs';
import { parseAgentOutput } from './lib.mjs';

const [, , agentOutputFile, inputFile, resultFile] = process.argv;
if (!agentOutputFile || !inputFile || !resultFile) {
  console.error('::error::parse-output.mjs: usage: parse-output.mjs <agent-output> <input-json> <result-json>');
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(agentOutputFile, 'utf8');
} catch (err) {
  // Missing agent output → unparseable, route to fallback.
  fs.writeFileSync(resultFile, JSON.stringify({ ok: false, reason: `agent output file unreadable: ${err.message}` }));
  console.log('parse-output: agent output unreadable; result=ok:false');
  process.exit(0);
}

const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const existingNumbers = new Set(input.existing.map((e) => e.number));
const result = parseAgentOutput(raw, input.proposed, existingNumbers);
fs.writeFileSync(resultFile, JSON.stringify(result));
console.log(`parse-output: ok=${result.ok}${result.ok ? '' : ` reason="${result.reason}"`}`);
