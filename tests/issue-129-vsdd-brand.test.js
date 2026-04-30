// Phase 2a Red-Gate suite for sw2m/philosophies#129.
//
// Tech-spec: Redesign gate markers — SHA-free diode with whitelist/brand.
// The marker token is `<!-- vsdd-red-gate-cleared -->` (no SHA). A new
// `vsdd-brand.yml` workflow applies the `vsdd:opt-out` label based on
// whitelist-match, impl-content, and marker-presence. Pure helper functions
// live in `.github/scripts/vsdd-brand.js`.
//
// Run with: node --test tests/issue-129-vsdd-brand.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// -----------------------------------------------------------------------------
// Module import — these functions must exist in the implementation.
// -----------------------------------------------------------------------------

const {
  isUnderDotGithub,
  computeBrandState,
  hasMarkerToken,
  MARKER_TOKEN,
} = require('../.github/scripts/vsdd-brand.js');

// -----------------------------------------------------------------------------
// 1. isUnderDotGithub(path) — path prefix check.
// Spec: `path.startsWith('.github/')` by raw string comparison.
// -----------------------------------------------------------------------------

test('isUnderDotGithub: .github/workflows/foo.yml → true', () => {
  assert.strictEqual(isUnderDotGithub('.github/workflows/foo.yml'), true);
});

test('isUnderDotGithub: .github/foo.yml → true', () => {
  assert.strictEqual(isUnderDotGithub('.github/foo.yml'), true);
});

test('isUnderDotGithub: src/.github/foo.yml → false (not prefix)', () => {
  // Per spec: "src/.github/foo.yml does NOT match"
  assert.strictEqual(isUnderDotGithub('src/.github/foo.yml'), false);
});

test('isUnderDotGithub: .github → false (no trailing slash)', () => {
  // ".github" alone is not ".github/"-prefixed
  assert.strictEqual(isUnderDotGithub('.github'), false);
});

test('isUnderDotGithub: .github/ → true (directory itself)', () => {
  assert.strictEqual(isUnderDotGithub('.github/'), true);
});

test('isUnderDotGithub: .githubignore → false', () => {
  assert.strictEqual(isUnderDotGithub('.githubignore'), false);
});

test('isUnderDotGithub: src/main.js → false', () => {
  assert.strictEqual(isUnderDotGithub('src/main.js'), false);
});

test('isUnderDotGithub: empty string → false', () => {
  assert.strictEqual(isUnderDotGithub(''), false);
});

// -----------------------------------------------------------------------------
// 2. computeBrandState({whitelist, hasImpl, markerPresent}) — brand logic.
// Spec: brand-applied iff (whitelist-match OR (no marker AND has impl-content))
// -----------------------------------------------------------------------------

test('computeBrandState: whitelist=true → brand applied (regardless of others)', () => {
  // Whitelist match always triggers brand
  assert.strictEqual(computeBrandState({ whitelist: true, hasImpl: false, markerPresent: false }), true);
  assert.strictEqual(computeBrandState({ whitelist: true, hasImpl: true, markerPresent: false }), true);
  assert.strictEqual(computeBrandState({ whitelist: true, hasImpl: false, markerPresent: true }), true);
  assert.strictEqual(computeBrandState({ whitelist: true, hasImpl: true, markerPresent: true }), true);
});

test('computeBrandState: no marker + has impl → brand applied', () => {
  assert.strictEqual(computeBrandState({ whitelist: false, hasImpl: true, markerPresent: false }), true);
});

test('computeBrandState: has marker + has impl → brand NOT applied', () => {
  // Marker present means the PR went through VSDD; no opt-out needed
  assert.strictEqual(computeBrandState({ whitelist: false, hasImpl: true, markerPresent: true }), false);
});

test('computeBrandState: no marker + no impl (tests-only PR) → brand NOT applied', () => {
  // A tests-only PR without marker doesn't need the brand
  assert.strictEqual(computeBrandState({ whitelist: false, hasImpl: false, markerPresent: false }), false);
});

test('computeBrandState: has marker + no impl → brand NOT applied', () => {
  assert.strictEqual(computeBrandState({ whitelist: false, hasImpl: false, markerPresent: true }), false);
});

// -----------------------------------------------------------------------------
// 3. hasMarkerToken(body) — token detection in comment body.
// Spec: body contains `<!-- vsdd-red-gate-cleared -->` on its own line.
// -----------------------------------------------------------------------------

test('hasMarkerToken: exact token on own line → true', () => {
  const body = '<!-- vsdd-red-gate-cleared -->\n\n_Phase 2 conditions met._';
  assert.strictEqual(hasMarkerToken(body), true);
});

test('hasMarkerToken: token at start of body → true', () => {
  const body = '<!-- vsdd-red-gate-cleared -->\nMore text';
  assert.strictEqual(hasMarkerToken(body), true);
});

test('hasMarkerToken: token in middle of body → true', () => {
  const body = 'Preamble\n<!-- vsdd-red-gate-cleared -->\nPostamble';
  assert.strictEqual(hasMarkerToken(body), true);
});

test('hasMarkerToken: token not on own line → false', () => {
  const body = 'Some text <!-- vsdd-red-gate-cleared --> more text';
  assert.strictEqual(hasMarkerToken(body), false);
});

test('hasMarkerToken: partial token → false', () => {
  const body = '<!-- vsdd-red-gate -->\nNot the full token';
  assert.strictEqual(hasMarkerToken(body), false);
});

test('hasMarkerToken: old SHA-based marker → false', () => {
  // The old format included a SHA; must NOT match
  const body = '✓ VSDD Red gate cleared at abc123. Non-test commits permitted.';
  assert.strictEqual(hasMarkerToken(body), false);
});

test('hasMarkerToken: empty body → false', () => {
  assert.strictEqual(hasMarkerToken(''), false);
});

test('hasMarkerToken: token only (no newline) → true', () => {
  // Edge case: body is exactly the token with no trailing newline
  assert.strictEqual(hasMarkerToken('<!-- vsdd-red-gate-cleared -->'), true);
});

// -----------------------------------------------------------------------------
// 4. MARKER_TOKEN constant — verifies the exact token string.
// -----------------------------------------------------------------------------

test('MARKER_TOKEN constant equals the spec-defined token', () => {
  assert.strictEqual(MARKER_TOKEN, '<!-- vsdd-red-gate-cleared -->');
});

// -----------------------------------------------------------------------------
// 5. Workflow file assertions — red-conditions-gate.yml marker format.
// -----------------------------------------------------------------------------

const RED_GATE_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'red-conditions-gate.yml',
);

test('red-conditions-gate.yml: marker body contains token literal', () => {
  const content = fs.readFileSync(RED_GATE_PATH, 'utf8');
  assert.match(
    content,
    /<!-- vsdd-red-gate-cleared -->/,
    'red-conditions-gate.yml must post the token literal in marker body',
  );
});

test('red-conditions-gate.yml: marker body does NOT contain $HEAD_SHA substitution', () => {
  const content = fs.readFileSync(RED_GATE_PATH, 'utf8');
  // The old marker format: `✓ VSDD Red gate cleared at $HEAD_SHA`
  // The new format must NOT interpolate SHA.
  // Check the gh pr comment line specifically.
  const commentLine = content.match(/gh pr comment.*--body.*/)?.[0] || '';
  assert.doesNotMatch(
    commentLine,
    /\$HEAD_SHA|\$\{HEAD_SHA\}/,
    'marker comment must not interpolate HEAD_SHA',
  );
});

test('red-conditions-gate.yml: marker body matches spec format exactly', () => {
  const content = fs.readFileSync(RED_GATE_PATH, 'utf8');
  // Spec: `<!-- vsdd-red-gate-cleared -->\n\n_Phase 2 conditions met. This marker latches; the bot will not revoke it._\n`
  const expectedPattern = /<!-- vsdd-red-gate-cleared -->\\n\\n_Phase 2 conditions met\. This marker latches; the bot will not revoke it\._\\n/;
  assert.match(
    content,
    expectedPattern,
    'marker body must match the spec-defined format',
  );
});

// -----------------------------------------------------------------------------
// 6. Workflow file assertions — vsdd-marker-check.yml existence and structure.
// -----------------------------------------------------------------------------

const MARKER_CHECK_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'vsdd-marker-check.yml',
);

test('vsdd-marker-check.yml: file exists', () => {
  assert.ok(
    fs.existsSync(MARKER_CHECK_PATH),
    'vsdd-marker-check.yml must exist as a reusable workflow',
  );
});

test('vsdd-marker-check.yml: exposes workflow_call trigger', () => {
  const content = fs.readFileSync(MARKER_CHECK_PATH, 'utf8');
  assert.match(
    content,
    /workflow_call:/,
    'vsdd-marker-check.yml must expose workflow_call trigger',
  );
});

test('vsdd-marker-check.yml: outputs marker-present', () => {
  const content = fs.readFileSync(MARKER_CHECK_PATH, 'utf8');
  assert.match(
    content,
    /marker-present:/,
    'vsdd-marker-check.yml must output marker-present',
  );
});

test('vsdd-marker-check.yml: uses paginated comment fetch', () => {
  const content = fs.readFileSync(MARKER_CHECK_PATH, 'utf8');
  assert.match(
    content,
    /--paginate/,
    'marker check must use paginated API call',
  );
});

test('vsdd-marker-check.yml: checks author is github-actions[bot]', () => {
  const content = fs.readFileSync(MARKER_CHECK_PATH, 'utf8');
  assert.match(
    content,
    /github-actions\[bot\]/,
    'marker check must filter by github-actions[bot] author',
  );
});

// -----------------------------------------------------------------------------
// 7. Workflow file assertions — vsdd-brand.yml existence and structure.
// -----------------------------------------------------------------------------

const BRAND_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'vsdd-brand.yml',
);

test('vsdd-brand.yml: file exists', () => {
  assert.ok(
    fs.existsSync(BRAND_PATH),
    'vsdd-brand.yml must exist',
  );
});

test('vsdd-brand.yml: triggers on pull_request events', () => {
  const content = fs.readFileSync(BRAND_PATH, 'utf8');
  assert.match(
    content,
    /pull_request:/,
    'vsdd-brand.yml must trigger on pull_request',
  );
});

test('vsdd-brand.yml: triggers on issue_comment.deleted', () => {
  const content = fs.readFileSync(BRAND_PATH, 'utf8');
  assert.match(
    content,
    /issue_comment:/,
    'vsdd-brand.yml must trigger on issue_comment',
  );
});

test('vsdd-brand.yml: uses concurrency with cancel-in-progress', () => {
  const content = fs.readFileSync(BRAND_PATH, 'utf8');
  assert.match(
    content,
    /concurrency:/,
    'vsdd-brand.yml must use concurrency',
  );
  assert.match(
    content,
    /cancel-in-progress:\s*true/,
    'vsdd-brand.yml must use cancel-in-progress: true',
  );
});

test('vsdd-brand.yml: references vsdd:opt-out label', () => {
  const content = fs.readFileSync(BRAND_PATH, 'utf8');
  assert.match(
    content,
    /vsdd:opt-out/,
    'vsdd-brand.yml must reference the vsdd:opt-out label',
  );
});

test('vsdd-brand.yml: calls vsdd-marker-check.yml', () => {
  const content = fs.readFileSync(BRAND_PATH, 'utf8');
  assert.match(
    content,
    /vsdd-marker-check\.yml/,
    'vsdd-brand.yml must call vsdd-marker-check.yml',
  );
});

// -----------------------------------------------------------------------------
// 8. Non-tautological: brand logic edge cases and truth table verification.
// -----------------------------------------------------------------------------

test('computeBrandState: full truth table matches spec', () => {
  // Spec: brand-applied iff (whitelist-match OR (no marker AND has impl-content))
  // Truth table:
  // | whitelist | hasImpl | markerPresent | brand |
  // |-----------|---------|---------------|-------|
  // | T         | T       | T             | T     | (whitelist)
  // | T         | T       | F             | T     | (whitelist)
  // | T         | F       | T             | T     | (whitelist)
  // | T         | F       | F             | T     | (whitelist)
  // | F         | T       | T             | F     | (has marker)
  // | F         | T       | F             | T     | (no marker + impl)
  // | F         | F       | T             | F     | (has marker)
  // | F         | F       | F             | F     | (no impl)

  const cases = [
    { whitelist: true,  hasImpl: true,  markerPresent: true,  expected: true },
    { whitelist: true,  hasImpl: true,  markerPresent: false, expected: true },
    { whitelist: true,  hasImpl: false, markerPresent: true,  expected: true },
    { whitelist: true,  hasImpl: false, markerPresent: false, expected: true },
    { whitelist: false, hasImpl: true,  markerPresent: true,  expected: false },
    { whitelist: false, hasImpl: true,  markerPresent: false, expected: true },
    { whitelist: false, hasImpl: false, markerPresent: true,  expected: false },
    { whitelist: false, hasImpl: false, markerPresent: false, expected: false },
  ];

  for (const c of cases) {
    const actual = computeBrandState({
      whitelist: c.whitelist,
      hasImpl: c.hasImpl,
      markerPresent: c.markerPresent,
    });
    assert.strictEqual(
      actual,
      c.expected,
      `computeBrandState({whitelist:${c.whitelist}, hasImpl:${c.hasImpl}, markerPresent:${c.markerPresent}}) should be ${c.expected}`,
    );
  }
});
