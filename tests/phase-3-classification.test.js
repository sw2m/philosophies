// Phase 2a Red-Gate suite for sw2m/philosophies#94.
//
// Run with: node --test tests/phase-3-classification.test.js
//
// Asserts that the Phase 3 reviewer prompt (PHASE_3_PROMPT in pr-review.yml)
// contains the classification rubric, output-syntax instructions, and
// fail-closed default per the tech-spec.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'pr-review.yml',
);

function extractPhase3Prompt() {
  const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const startMarker = 'PHASE_3_PROMPT: |-';
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('PHASE_3_PROMPT not found in pr-review.yml');
  }
  const afterMarker = content.slice(startIdx + startMarker.length);
  const jobsMatch = afterMarker.match(/\njobs:/);
  if (!jobsMatch) {
    throw new Error('Could not find end of PHASE_3_PROMPT (jobs: section)');
  }
  return afterMarker.slice(0, jobsMatch.index);
}

// -----------------------------------------------------------------------------
// 1. Classification rubric — PR-scope definition
// -----------------------------------------------------------------------------

test('prompt contains PR-scope definition', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /PR-scope/i,
    'Prompt must define "PR-scope" classification',
  );
  assert.match(
    prompt,
    /diff.*hunk|hunk.*diff/i,
    'PR-scope definition must reference diff hunks',
  );
  assert.match(
    prompt,
    /introduce|modif|newly.*expos/i,
    'PR-scope definition must cover introduced/modified/newly-exposed behavior',
  );
});

// -----------------------------------------------------------------------------
// 2. Classification rubric — out-of-scope definition
// -----------------------------------------------------------------------------

test('prompt contains out-of-scope definition', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /out-of-scope/i,
    'Prompt must define "out-of-scope" classification',
  );
  assert.match(
    prompt,
    /pre-existing|pre existing/i,
    'Out-of-scope definition must reference pre-existing code',
  );
});

// -----------------------------------------------------------------------------
// 3. Boundary case — newly exposed blast radius
// -----------------------------------------------------------------------------

test('prompt contains newly-exposed boundary case clarification', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /newly.*expos.*blast.*radius|blast.*radius.*newly.*expos/i,
    'Prompt must clarify the "newly exposed" blast radius boundary case',
  );
});

// -----------------------------------------------------------------------------
// 4. Boundary case — mixed-scope concerns
// -----------------------------------------------------------------------------

test('prompt contains mixed-scope boundary case clarification', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /mixed.*scope|dominant.*cause/i,
    'Prompt must clarify mixed-scope concerns and dominant cause rule',
  );
});

// -----------------------------------------------------------------------------
// 5. Output syntax — scope tokens
// -----------------------------------------------------------------------------

test('prompt specifies [PR-scope] token literal', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /\[PR-scope\]/,
    'Prompt must specify the literal [PR-scope] token',
  );
});

test('prompt specifies [out-of-scope] token literal', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /\[out-of-scope\]/,
    'Prompt must specify the literal [out-of-scope] token',
  );
});

test('prompt specifies scope token position relative to severity marker', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /severity.*marker.*scope.*token|scope.*token.*after.*severity|\(blocking\).*\[PR-scope\]/i,
    'Prompt must specify scope token position (after severity marker)',
  );
});

// -----------------------------------------------------------------------------
// 6. Bullets-only-for-concerns rule
// -----------------------------------------------------------------------------

test('prompt specifies non-concern commentary must not use bullets', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /non-concern.*must not.*bullet|commentary.*not.*bullet.*form|commendation.*prose|observation.*not.*concern.*prose/i,
    'Prompt must specify that non-concern commentary (commendations, observations) must NOT use bullet format',
  );
});

// -----------------------------------------------------------------------------
// 7. Fail-closed default
// -----------------------------------------------------------------------------

test('prompt specifies fail-closed default for missing tokens', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /fail.*closed|without.*recognized.*token.*PR-scope|unrecognized.*token.*PR-scope/i,
    'Prompt must specify fail-closed default (missing tokens route as PR-scope)',
  );
});

// -----------------------------------------------------------------------------
// 8. Verdict line semantics — PR-scope only triggers fail
// -----------------------------------------------------------------------------

test('prompt specifies verdict reflects PR-scope concerns only', () => {
  const prompt = extractPhase3Prompt();
  assert.match(
    prompt,
    /verdict.*PR-scope.*only|out-of-scope.*not.*trigger.*fail|out-of-scope.*do.*not.*fail/i,
    'Prompt must specify that only PR-scope concerns contribute to fail verdict',
  );
});
