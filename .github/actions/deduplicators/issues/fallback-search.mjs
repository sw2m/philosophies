#!/usr/bin/env node
// Step 4 — title-exact fallback. Single `gh issue list` call, in-memory
// match. No `--search` (which would interpolate user-controlled titles into
// GitHub's search syntax); we filter client-side via the pure helper in lib.
//
// argv:
//   [2] = path to {proposed, existing} JSON
//   [3] = path to write the fallback verdicts JSON envelope
//
// Hard-fails (exits 1) if `gh` errors. Per the failure-mode contract,
// no graceful degrade — partial fallback could silently lose the
// active-remediation signal.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extractMatches } from './lib.mjs';

const [, , inputFile, resultFile] = process.argv;
if (!inputFile || !resultFile) {
  console.error('::error::fallback-search.mjs: usage: fallback-search.mjs <input-json> <result-json>');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// One call, fetch up to 200 open issues with title+number. The 200 cap
// matches the `gh issue list --limit 200` ceiling used by the prep-dedup
// step in ci-meta.yml's consensus job; if the workload outgrows it, raise
// in lockstep.
const result = spawnSync(
  'gh',
  ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title'],
  { encoding: 'utf8' },
);
if (result.status !== 0) {
  console.error('::error::fallback-search.mjs: gh issue list failed');
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

let ghResponse;
try {
  ghResponse = JSON.parse(result.stdout);
} catch (err) {
  console.error(`::error::fallback-search.mjs: gh output is not valid JSON: ${err.message}`);
  process.exit(1);
}

const verdicts = extractMatches(input.proposed, ghResponse);
fs.writeFileSync(resultFile, JSON.stringify({ verdicts }));
const matched = verdicts.filter((v) => v.duplicate_of !== null).length;
console.log(`fallback-search: ${matched}/${verdicts.length} title-exact matches against ${ghResponse.length} open issues`);
