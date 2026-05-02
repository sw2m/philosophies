// Phase 2a Red-Gate suite for sw2m/philosophies#128.
//
// Tech-spec: Apply cardinality rule to goal-spec decomposition.
// A new module `phase-1c-cardinality.js` provides count parsing,
// classification computation, per-axis-min selection, and orchestrator
// frontmatter generation/parsing.
//
// Run with: node --test tests/phase-1c-cardinality.test.js

const { test } = require('node:test');
const assert = require('node:assert');

const {
  parseCountTuple,
  isValidCount,
  computeClassification,
  perAxisMin,
  buildOrchestratorFrontmatter,
  parseOrchestratorFrontmatter,
  extractReviewerTuples,
} = require('../.github/scripts/phase-1c-cardinality.js');

// -----------------------------------------------------------------------------
// 1. Valid count detection.
// A valid count is an integer >= 1. Zero, negatives, decimals, non-numeric,
// missing values are all invalid per the tech-spec.
// -----------------------------------------------------------------------------

test('isValidCount: positive integers are valid', () => {
  assert.strictEqual(isValidCount(1), true);
  assert.strictEqual(isValidCount(2), true);
  assert.strictEqual(isValidCount(100), true);
});

test('isValidCount: zero is invalid', () => {
  assert.strictEqual(isValidCount(0), false);
});

test('isValidCount: negative numbers are invalid', () => {
  assert.strictEqual(isValidCount(-1), false);
  assert.strictEqual(isValidCount(-5), false);
});

test('isValidCount: decimals are invalid', () => {
  assert.strictEqual(isValidCount(1.5), false);
  assert.strictEqual(isValidCount(2.0), true); // 2.0 is numerically an integer
  assert.strictEqual(isValidCount(0.5), false);
});

test('isValidCount: non-numeric values are invalid', () => {
  assert.strictEqual(isValidCount(null), false);
  assert.strictEqual(isValidCount(undefined), false);
  assert.strictEqual(isValidCount(''), false);
  assert.strictEqual(isValidCount('two'), false);
  assert.strictEqual(isValidCount(NaN), false);
});

test('isValidCount: numeric strings are coerced and validated', () => {
  assert.strictEqual(isValidCount('3'), true);
  assert.strictEqual(isValidCount('0'), false);
  assert.strictEqual(isValidCount('-1'), false);
  assert.strictEqual(isValidCount('1.5'), false);
});

// -----------------------------------------------------------------------------
// 2. Count tuple parsing from frontmatter.
// Extracts subjects and outcomes from reviewer comment frontmatter.
// -----------------------------------------------------------------------------

test('parseCountTuple: extracts both fields from valid frontmatter', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`;
  const result = parseCountTuple(frontmatter);
  assert.deepStrictEqual(result, { subjects: 2, outcomes: 1 });
});

test('parseCountTuple: returns null for missing subjects field', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
outcomes: 1
-->`;
  const result = parseCountTuple(frontmatter);
  assert.strictEqual(result, null);
});

test('parseCountTuple: returns null for missing outcomes field', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
-->`;
  const result = parseCountTuple(frontmatter);
  assert.strictEqual(result, null);
});

test('parseCountTuple: returns null for invalid subjects value', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 0
outcomes: 1
-->`;
  const result = parseCountTuple(frontmatter);
  assert.strictEqual(result, null);
});

test('parseCountTuple: returns null for non-numeric subjects', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: many
outcomes: 1
-->`;
  const result = parseCountTuple(frontmatter);
  assert.strictEqual(result, null);
});

test('parseCountTuple: handles whitespace variations in frontmatter', () => {
  const frontmatter = `<!-- vsdd-phase-1c
reviewer:  gemini
verdict:pass
subjects:   3
outcomes: 2
-->`;
  const result = parseCountTuple(frontmatter);
  assert.deepStrictEqual(result, { subjects: 3, outcomes: 2 });
});

// -----------------------------------------------------------------------------
// 3. Classification computation.
// min(subjects, outcomes) == 1 means "single tech-spec granularity".
// min(subjects, outcomes) >= 2 means "needs decomposition".
// -----------------------------------------------------------------------------

test('computeClassification: min == 1 when subjects == 1', () => {
  const result = computeClassification({ subjects: 1, outcomes: 5 });
  assert.strictEqual(result.min, 1);
  assert.strictEqual(result.isSingleTechSpec, true);
});

test('computeClassification: min == 1 when outcomes == 1', () => {
  const result = computeClassification({ subjects: 3, outcomes: 1 });
  assert.strictEqual(result.min, 1);
  assert.strictEqual(result.isSingleTechSpec, true);
});

test('computeClassification: min >= 2 when both >= 2', () => {
  const result = computeClassification({ subjects: 2, outcomes: 3 });
  assert.strictEqual(result.min, 2);
  assert.strictEqual(result.isSingleTechSpec, false);
});

test('computeClassification: larger values still produce correct min', () => {
  const result = computeClassification({ subjects: 10, outcomes: 5 });
  assert.strictEqual(result.min, 5);
  assert.strictEqual(result.isSingleTechSpec, false);
});

// -----------------------------------------------------------------------------
// 4. Per-axis minimum selection.
// When reviewers agree on classification but report different tuples,
// take the per-axis minimum.
// -----------------------------------------------------------------------------

test('perAxisMin: identical tuples return same tuple', () => {
  const result = perAxisMin(
    { subjects: 2, outcomes: 1 },
    { subjects: 2, outcomes: 1 },
  );
  assert.deepStrictEqual(result, { subjects: 2, outcomes: 1 });
});

test('perAxisMin: different tuples return per-axis min', () => {
  const result = perAxisMin(
    { subjects: 3, outcomes: 2 },
    { subjects: 2, outcomes: 4 },
  );
  assert.deepStrictEqual(result, { subjects: 2, outcomes: 2 });
});

test('perAxisMin: preserves min == 1 classification when both have min == 1', () => {
  const result = perAxisMin(
    { subjects: 1, outcomes: 5 },
    { subjects: 3, outcomes: 1 },
  );
  // Per-axis min: subjects = min(1, 3) = 1, outcomes = min(5, 1) = 1
  assert.deepStrictEqual(result, { subjects: 1, outcomes: 1 });
  const classification = computeClassification(result);
  assert.strictEqual(classification.isSingleTechSpec, true);
});

test('perAxisMin: preserves min >= 2 classification when both have min >= 2', () => {
  const result = perAxisMin(
    { subjects: 4, outcomes: 2 },
    { subjects: 2, outcomes: 3 },
  );
  // Per-axis min: subjects = min(4, 2) = 2, outcomes = min(2, 3) = 2
  assert.deepStrictEqual(result, { subjects: 2, outcomes: 2 });
  const classification = computeClassification(result);
  assert.strictEqual(classification.isSingleTechSpec, false);
});

// -----------------------------------------------------------------------------
// 5. Orchestrator frontmatter generation.
// The orchestrator posts a comment with frontmatter including the
// canonical tuple and verdict.
// -----------------------------------------------------------------------------

test('buildOrchestratorFrontmatter: pass verdict with tuple', () => {
  const fm = buildOrchestratorFrontmatter({
    verdict: 'pass',
    subjects: 2,
    outcomes: 1,
  });
  assert.match(fm, /<!-- vsdd-phase-1c/);
  assert.match(fm, /reviewer: orchestrator/);
  assert.match(fm, /verdict: pass/);
  assert.match(fm, /subjects: 2/);
  assert.match(fm, /outcomes: 1/);
  assert.match(fm, /-->/);
});

test('buildOrchestratorFrontmatter: fail verdict without tuple', () => {
  const fm = buildOrchestratorFrontmatter({
    verdict: 'fail',
  });
  assert.match(fm, /reviewer: orchestrator/);
  assert.match(fm, /verdict: fail/);
  assert.doesNotMatch(fm, /subjects:/);
  assert.doesNotMatch(fm, /outcomes:/);
});

test('buildOrchestratorFrontmatter: fail verdict with partial tuple (for diagnostics)', () => {
  const fm = buildOrchestratorFrontmatter({
    verdict: 'fail',
    subjects: 2,
  });
  assert.match(fm, /verdict: fail/);
  assert.match(fm, /subjects: 2/);
  assert.doesNotMatch(fm, /outcomes:/);
});

// -----------------------------------------------------------------------------
// 6. Orchestrator frontmatter parsing.
// Reading the canonical tuple back from an orchestrator comment.
// -----------------------------------------------------------------------------

test('parseOrchestratorFrontmatter: extracts pass verdict with tuple', () => {
  const body = `<!-- vsdd-phase-1c
reviewer: orchestrator
verdict: pass
subjects: 2
outcomes: 1
-->

**Cardinality:** (2, 1) — min == 1, single tech-spec.`;
  const result = parseOrchestratorFrontmatter(body);
  assert.deepStrictEqual(result, {
    reviewer: 'orchestrator',
    verdict: 'pass',
    subjects: 2,
    outcomes: 1,
  });
});

test('parseOrchestratorFrontmatter: returns null for non-orchestrator comment', () => {
  const body = `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`;
  const result = parseOrchestratorFrontmatter(body);
  assert.strictEqual(result, null);
});

test('parseOrchestratorFrontmatter: handles fail verdict', () => {
  const body = `<!-- vsdd-phase-1c
reviewer: orchestrator
verdict: fail
-->

(blocking) Reviewers disagree on classification.`;
  const result = parseOrchestratorFrontmatter(body);
  assert.strictEqual(result.verdict, 'fail');
  assert.strictEqual(result.subjects, undefined);
  assert.strictEqual(result.outcomes, undefined);
});

// -----------------------------------------------------------------------------
// 7. Extract reviewer tuples from comment list.
// Scans comments for gemini and claude frontmatter with count tuples.
// -----------------------------------------------------------------------------

test('extractReviewerTuples: extracts both reviewer tuples', () => {
  const comments = [
    {
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`,
    },
    {
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-phase-1c
reviewer: claude
verdict: pass
subjects: 3
outcomes: 1
-->`,
    },
  ];
  const result = extractReviewerTuples(comments);
  assert.deepStrictEqual(result.gemini, { subjects: 2, outcomes: 1 });
  assert.deepStrictEqual(result.claude, { subjects: 3, outcomes: 1 });
});

test('extractReviewerTuples: returns null for missing reviewer', () => {
  const comments = [
    {
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`,
    },
  ];
  const result = extractReviewerTuples(comments);
  assert.deepStrictEqual(result.gemini, { subjects: 2, outcomes: 1 });
  assert.strictEqual(result.claude, null);
});

test('extractReviewerTuples: returns null for reviewer without count fields', () => {
  const comments = [
    {
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
-->`,
    },
    {
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-phase-1c
reviewer: claude
verdict: pass
subjects: 2
outcomes: 1
-->`,
    },
  ];
  const result = extractReviewerTuples(comments);
  assert.strictEqual(result.gemini, null);
  assert.deepStrictEqual(result.claude, { subjects: 2, outcomes: 1 });
});

test('extractReviewerTuples: uses most recent comment per reviewer', () => {
  const comments = [
    {
      user: { login: 'github-actions[bot]' },
      created_at: '2026-01-01T00:00:00Z',
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: fail
subjects: 5
outcomes: 5
-->`,
    },
    {
      user: { login: 'github-actions[bot]' },
      created_at: '2026-01-02T00:00:00Z',
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`,
    },
  ];
  const result = extractReviewerTuples(comments);
  // Should use the more recent comment (2026-01-02)
  assert.deepStrictEqual(result.gemini, { subjects: 2, outcomes: 1 });
});

test('extractReviewerTuples: ignores non-bot comments', () => {
  const comments = [
    {
      user: { login: 'some-human' },
      body: `<!-- vsdd-phase-1c
reviewer: gemini
verdict: pass
subjects: 2
outcomes: 1
-->`,
    },
  ];
  const result = extractReviewerTuples(comments);
  assert.strictEqual(result.gemini, null);
});

// -----------------------------------------------------------------------------
// 8. Classification agreement detection.
// Two tuples "agree on classification" if both have min == 1 or both have
// min >= 2. Disagreement is when one has min == 1 and the other has min >= 2.
// -----------------------------------------------------------------------------

test('computeClassification: agreement when both min == 1', () => {
  const a = computeClassification({ subjects: 1, outcomes: 3 });
  const b = computeClassification({ subjects: 2, outcomes: 1 });
  assert.strictEqual(a.isSingleTechSpec, true);
  assert.strictEqual(b.isSingleTechSpec, true);
  // Both agree: single tech-spec
});

test('computeClassification: agreement when both min >= 2', () => {
  const a = computeClassification({ subjects: 3, outcomes: 2 });
  const b = computeClassification({ subjects: 5, outcomes: 4 });
  assert.strictEqual(a.isSingleTechSpec, false);
  assert.strictEqual(b.isSingleTechSpec, false);
  // Both agree: needs decomposition
});

test('computeClassification: disagreement when one min == 1, other min >= 2', () => {
  const a = computeClassification({ subjects: 1, outcomes: 3 });
  const b = computeClassification({ subjects: 3, outcomes: 2 });
  assert.strictEqual(a.isSingleTechSpec, true);
  assert.strictEqual(b.isSingleTechSpec, false);
  // Disagreement: blocking
});

// -----------------------------------------------------------------------------
// 9. Edge cases: boundary values.
// -----------------------------------------------------------------------------

test('isValidCount: MAX_SAFE_INTEGER is valid', () => {
  assert.strictEqual(isValidCount(Number.MAX_SAFE_INTEGER), true);
});

test('computeClassification: equal subjects and outcomes', () => {
  const result = computeClassification({ subjects: 3, outcomes: 3 });
  assert.strictEqual(result.min, 3);
  assert.strictEqual(result.isSingleTechSpec, false);
});

test('perAxisMin: handles single-value intersection correctly', () => {
  // Both have min == 1 via different axes
  const result = perAxisMin(
    { subjects: 1, outcomes: 10 },
    { subjects: 10, outcomes: 1 },
  );
  assert.deepStrictEqual(result, { subjects: 1, outcomes: 1 });
});
