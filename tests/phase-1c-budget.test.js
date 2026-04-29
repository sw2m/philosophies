// Phase 2a Red-Gate suite for sw2m/philosophies#88.
//
// Run with: node --test tests/phase-1c-budget.test.js

const { test } = require('node:test');
const assert = require('node:assert');

const {
  INITIAL_BUDGET,
  BUDGET_STEP,
  computeRound,
  computeBudget,
  demoteExcess,
  countMarkers,
  processReview,
  frontmatterRegexFor,
} = require('../.github/scripts/phase-1c-budget.js');

// -----------------------------------------------------------------------------
// 1. Round counting from comment history.
// -----------------------------------------------------------------------------

test('round counting: gemini round = 3 with 2 prior gemini comments', () => {
  const comments = [
    { body: '<!-- vsdd-phase-1c\nreviewer: gemini\nverdict: fail\n-->\nbody1' },
    { body: '<!-- vsdd-phase-1c\nreviewer: claude\nverdict: pass\n-->\nbody2' },
    { body: '<!-- vsdd-phase-1c\nreviewer: gemini\nverdict: fail\n-->\nbody3' },
    { body: 'unrelated comment without frontmatter' },
  ];
  assert.strictEqual(computeRound(comments, 'gemini'), 3);
  assert.strictEqual(computeRound(comments, 'claude'), 2);
});

test('round counting: ignores frontmatter not at body start', () => {
  // Frontmatter must open the comment body. A frontmatter-shaped block in
  // the middle of a comment is not counted.
  const comments = [
    {
      body:
        'preamble line\n<!-- vsdd-phase-1c\nreviewer: gemini\nverdict: fail\n-->',
    },
  ];
  assert.strictEqual(computeRound(comments, 'gemini'), 1);
});

// -----------------------------------------------------------------------------
// 2. Budget formula.
// -----------------------------------------------------------------------------

test('budget formula: 7, 5, 3, 1, 0, 0 for rounds 1..6', () => {
  const expected = [7, 5, 3, 1, 0, 0];
  for (let r = 1; r <= 6; r += 1) {
    assert.strictEqual(computeBudget(r), expected[r - 1]);
  }
});

test('budget constants: INITIAL=7, STEP=2', () => {
  assert.strictEqual(INITIAL_BUDGET, 7);
  assert.strictEqual(BUDGET_STEP, 2);
});

// -----------------------------------------------------------------------------
// 3. Demotion at over-budget.
// -----------------------------------------------------------------------------

test('demotion: 6 markers, budget 3 → 3 retained, 3 demoted', () => {
  const body =
    '- (blocking) one\n' +
    '- (blocking) two\n' +
    '- (blocking) three\n' +
    '- (blocking) four\n' +
    '- (blocking) five\n' +
    '- (blocking) six\n' +
    '\n_Verdict: `fail`_\n';
  const result = demoteExcess(body, 3);
  assert.strictEqual(result.demoted, 3);
  assert.strictEqual(result.originalCount, 6);
  assert.strictEqual(countMarkers(result.body), 3);
  // Excess demoted in textual order: items 4, 5, 6.
  assert.match(result.body, /- \(blocking\) one/);
  assert.match(result.body, /- \(blocking\) three/);
  assert.match(result.body, /- \(advisory; over-budget\) four/);
  assert.match(result.body, /- \(advisory; over-budget\) six/);
});

// -----------------------------------------------------------------------------
// 4. Verdict flip on full demotion.
// -----------------------------------------------------------------------------

test('verdict flip: budget 0, 4 markers → all demoted, verdict pass', () => {
  const body =
    '- (blocking) one\n' +
    '- (blocking) two\n' +
    '- (blocking) three\n' +
    '- (blocking) four\n' +
    '\n_Verdict: `fail`_\n';
  const result = processReview({ body, round: 5, budget: 0 });
  assert.strictEqual(result.verdict, 'pass');
  assert.strictEqual(result.demoted, 4);
  assert.match(result.body, /_Verdict: `pass`_/);
  assert.doesNotMatch(result.body, /_Verdict: `fail`_/);
  // Budget note inserted.
  assert.match(
    result.body,
    /_Budget note: round 5 budget 0; demoted 4 blocker\(s\) to advisory\._/,
  );
});

// -----------------------------------------------------------------------------
// 5. Verdict preserved when in-budget blockers remain.
// -----------------------------------------------------------------------------

test('verdict preserved: 4 markers, budget 2 → 2 demoted, verdict still fail', () => {
  const body =
    '- (blocking) one\n' +
    '- (blocking) two\n' +
    '- (blocking) three\n' +
    '- (blocking) four\n' +
    '\n_Verdict: `fail`_\n';
  const result = processReview({ body, round: 3, budget: 2 });
  assert.strictEqual(result.verdict, 'fail');
  assert.strictEqual(result.demoted, 2);
  assert.match(result.body, /_Verdict: `fail`_/);
  // Budget note inserted before verdict.
  const noteIdx = result.body.indexOf('_Budget note:');
  const verdictIdx = result.body.indexOf('_Verdict: `fail`_');
  assert.ok(noteIdx > 0, 'budget note present');
  assert.ok(verdictIdx > noteIdx, 'verdict line after budget note');
  // No content after verdict line beyond optional whitespace.
  const trailing = result.body.slice(verdictIdx + '_Verdict: `fail`_'.length);
  assert.match(trailing, /^\s*$/);
});

// -----------------------------------------------------------------------------
// 6. Round-zero (budget-zero, no markers) edge case: pass-through unchanged.
// -----------------------------------------------------------------------------

test('budget 0, zero markers: comment passes through unchanged', () => {
  const body = 'No Phase 1c concerns identified.\n\n_Verdict: `pass`_\n';
  const result = processReview({ body, round: 5, budget: 0 });
  assert.strictEqual(result.verdict, 'pass');
  assert.strictEqual(result.demoted, 0);
  assert.strictEqual(result.body, body);
  assert.doesNotMatch(result.body, /_Budget note:/);
});

// -----------------------------------------------------------------------------
// 7. Structural marker pattern: ignores prose / code-block (blocking).
// -----------------------------------------------------------------------------

test('structural pattern: ignores (blocking) outside markdown bullets', () => {
  const body =
    'Prose mentioning (blocking) inline does not count.\n' +
    '\n' +
    '```\n' +
    '// pseudocode\n' +
    'if (line.includes("(blocking)")) { ... }\n' +
    '```\n' +
    '\n' +
    '- (blocking) this is a real concern.\n' +
    '\n_Verdict: `fail`_\n';
  assert.strictEqual(countMarkers(body), 1);
});

test('structural pattern: ignores `- (blocking)` inside a fenced block', () => {
  // Reviewers sometimes put example bullets inside fences — those must NOT
  // be counted as real blockers per spec §88.
  const body =
    'Real concern below; fence above is a literal demonstration.\n' +
    '\n' +
    '```\n' +
    '- (blocking) this is a literal example, not a concern\n' +
    '- (blocking) likewise\n' +
    '```\n' +
    '\n' +
    '- (blocking) this is the actual concern.\n' +
    '\n_Verdict: `fail`_\n';
  assert.strictEqual(countMarkers(body), 1);
  // And demote-excess at budget 0 demotes only the real one, not the fenced.
  const result = processReview({ body, round: 5, budget: 0 });
  assert.strictEqual(result.demoted, 1);
  // The fenced bullets remain unchanged.
  assert.match(result.body, /- \(blocking\) this is a literal example/);
  assert.match(result.body, /- \(advisory; over-budget\) this is the actual/);
});

test('structural pattern: matches backtick-wrapped marker', () => {
  const body =
    '- `(blocking)` wrapped in inline code at start of bullet.\n' +
    '\n_Verdict: `fail`_\n';
  assert.strictEqual(countMarkers(body), 1);
});

// -----------------------------------------------------------------------------
// 8. Verdict-line-not-found fallback.
// -----------------------------------------------------------------------------

test('verdict-line missing: appends fail verdict, preserves prose', () => {
  const body =
    '- (blocking) reviewer forgot the verdict line\n\nMore prose with no verdict.\n';
  const result = processReview({ body, round: 1, budget: 7 });
  assert.strictEqual(result.verdict, 'fail');
  assert.match(result.body, /_Verdict: `fail`_/);
  assert.match(result.body, /reviewer forgot the verdict line/);
  // The original (in-budget) blocker is retained.
  assert.strictEqual(countMarkers(result.body), 1);
});

// -----------------------------------------------------------------------------
// 9. Frontmatter regex builder.
// -----------------------------------------------------------------------------

test('frontmatter regex: matches gemini, not claude', () => {
  const re = frontmatterRegexFor('gemini');
  assert.ok(
    re.test('<!-- vsdd-phase-1c\nreviewer: gemini\nverdict: fail\n-->'),
  );
  assert.ok(
    !re.test('<!-- vsdd-phase-1c\nreviewer: claude\nverdict: pass\n-->'),
  );
});
