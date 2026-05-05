#!/usr/bin/env node
// Step 1 — render the agent prompt.
//
// Reads `{proposed, existing}` JSON from stdin, writes the rendered prompt
// text to the file path passed as argv[2]. Hard-fails if the rendered text
// exceeds MAX_BYTES env var (parsed as int).

import fs from 'node:fs';
import { renderPrompt } from './lib.mjs';

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const outFile = process.argv[2];
if (!outFile) {
  console.error('::error::render-input.mjs: usage: render-input.mjs <output-file>');
  process.exit(2);
}

const maxBytesRaw = process.env.MAX_BYTES;
const maxBytes = maxBytesRaw ? parseInt(maxBytesRaw, 10) : undefined;
if (maxBytesRaw && (Number.isNaN(maxBytes) || maxBytes <= 0)) {
  console.error(`::error::render-input.mjs: MAX_BYTES env var must be a positive integer, got ${JSON.stringify(maxBytesRaw)}`);
  process.exit(2);
}

const raw = await readStdin();
const input = JSON.parse(raw);

let result;
try {
  result = renderPrompt(input, maxBytes);
} catch (err) {
  console.error(`::error::render-input.mjs: ${err.message}`);
  process.exit(1);
}

fs.writeFileSync(outFile, result.text);
console.log(`render-input: wrote ${result.bytes} bytes to ${outFile}`);
