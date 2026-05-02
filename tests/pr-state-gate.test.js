// Phase 2a Red-Gate suite for sw2m/philosophies#142.
//
// Tech-spec: Consolidate PR CI into single entry with state-protection gate.
// A new module `pr-state-gate.js` provides:
//   - computeProceedState: (isDraft, blessedMarkerPresent) → proceed boolean
//   - hasBlessedMarker: detects the `<!-- vsdd-pr-blessed -->` token in comments
//   - parseCommentKey: extracts (key, sha) from Grammar 2 HTML comment frontmatter
//   - findCommentByKey: locates comment by (key, sha) tuple for dedup
//
// Run with: node --test tests/pr-state-gate.test.js

const { test } = require('node:test');
const assert = require('node:assert');

const {
  BLESSED_TOKEN,
  computeProceedState,
  hasBlessedMarker,
  parseCommentKey,
  findCommentByKey,
  shouldAutoConvertToDraft,
} = require('../.github/scripts/pr-state-gate.js');

// -----------------------------------------------------------------------------
// 1. Blessed marker token constant.
// Grammar 1 per #137: token-only marker, no sha payload.
// -----------------------------------------------------------------------------

test('BLESSED_TOKEN: is the correct Grammar 1 token', () => {
  assert.strictEqual(BLESSED_TOKEN, '<!-- vsdd-pr-blessed -->');
});

// -----------------------------------------------------------------------------
// 2. computeProceedState — the core state-protection gate logic.
// Per tech-spec "Proceed logic (authoritative)":
//   - isDraft=false AND blessedMarker present → proceed=true
//   - isDraft=true (regardless of marker) → proceed=false
//   - isDraft=false AND blessedMarker absent → proceed=false
// -----------------------------------------------------------------------------

test('computeProceedState: ready PR with blessed marker → proceed=true', () => {
  const result = computeProceedState({ isDraft: false, blessedMarker: true });
  assert.strictEqual(result.proceed, true);
});

test('computeProceedState: ready PR without blessed marker → proceed=false', () => {
  const result = computeProceedState({ isDraft: false, blessedMarker: false });
  assert.strictEqual(result.proceed, false);
  assert.strictEqual(result.reason, 'no-marker');
});

test('computeProceedState: draft PR with blessed marker → proceed=false', () => {
  const result = computeProceedState({ isDraft: true, blessedMarker: true });
  assert.strictEqual(result.proceed, false);
  assert.strictEqual(result.reason, 'draft');
});

test('computeProceedState: draft PR without blessed marker → proceed=false', () => {
  const result = computeProceedState({ isDraft: true, blessedMarker: false });
  assert.strictEqual(result.proceed, false);
  assert.strictEqual(result.reason, 'draft');
});

// -----------------------------------------------------------------------------
// 3. hasBlessedMarker — Grammar 1 token detection in comment bodies.
// The marker is `<!-- vsdd-pr-blessed -->` on its own line.
// -----------------------------------------------------------------------------

test('hasBlessedMarker: detects token at start of body', () => {
  const body = `<!-- vsdd-pr-blessed -->

_PR has been observed in draft state._`;
  assert.strictEqual(hasBlessedMarker(body), true);
});

test('hasBlessedMarker: detects token in middle of body', () => {
  const body = `Some text before.

<!-- vsdd-pr-blessed -->

Some text after.`;
  assert.strictEqual(hasBlessedMarker(body), true);
});

test('hasBlessedMarker: detects token with trailing whitespace', () => {
  const body = '<!-- vsdd-pr-blessed -->   \n\nMore text.';
  assert.strictEqual(hasBlessedMarker(body), true);
});

test('hasBlessedMarker: rejects partial match', () => {
  const body = '<!-- vsdd-pr-blessed-extended -->\n\nNot the real token.';
  assert.strictEqual(hasBlessedMarker(body), false);
});

test('hasBlessedMarker: rejects embedded in larger comment', () => {
  const body = '<!-- some-wrapper <!-- vsdd-pr-blessed --> end -->';
  assert.strictEqual(hasBlessedMarker(body), false);
});

test('hasBlessedMarker: returns false for empty body', () => {
  assert.strictEqual(hasBlessedMarker(''), false);
});

test('hasBlessedMarker: returns false for null/undefined', () => {
  assert.strictEqual(hasBlessedMarker(null), false);
  assert.strictEqual(hasBlessedMarker(undefined), false);
});

test('hasBlessedMarker: handles CRLF line endings', () => {
  const body = '<!-- vsdd-pr-blessed -->\r\n\r\nWindows line endings.';
  assert.strictEqual(hasBlessedMarker(body), true);
});

// -----------------------------------------------------------------------------
// 4. parseCommentKey — Grammar 2 frontmatter extraction.
// Per tech-spec point 6: HTML-comment frontmatter with `key:` and `sha:`.
// Format: <!-- vsdd-pr-comment\nkey: <key>\nsha: <sha>\n-->
// -----------------------------------------------------------------------------

test('parseCommentKey: extracts key and sha from valid frontmatter', () => {
  const body = `<!-- vsdd-pr-comment
key: symbol-audit
sha: abc123def
-->

**Symbol Audit Results**`;
  const result = parseCommentKey(body);
  assert.deepStrictEqual(result, { key: 'symbol-audit', sha: 'abc123def' });
});

test('parseCommentKey: extracts from frontmatter with extra whitespace', () => {
  const body = `<!-- vsdd-pr-comment
key:   pr-review-gemini
sha:  deadbeef1234
-->`;
  const result = parseCommentKey(body);
  assert.deepStrictEqual(result, { key: 'pr-review-gemini', sha: 'deadbeef1234' });
});

test('parseCommentKey: returns null for missing key field', () => {
  const body = `<!-- vsdd-pr-comment
sha: abc123
-->`;
  const result = parseCommentKey(body);
  assert.strictEqual(result, null);
});

test('parseCommentKey: returns null for missing sha field', () => {
  const body = `<!-- vsdd-pr-comment
key: symbol-audit
-->`;
  const result = parseCommentKey(body);
  assert.strictEqual(result, null);
});

test('parseCommentKey: returns null for non-Grammar-2 comment', () => {
  const body = `<!-- vsdd-red-gate-cleared -->

Different marker type.`;
  const result = parseCommentKey(body);
  assert.strictEqual(result, null);
});

test('parseCommentKey: returns null for plain text body', () => {
  const body = 'Just a regular comment with no frontmatter.';
  const result = parseCommentKey(body);
  assert.strictEqual(result, null);
});

test('parseCommentKey: returns null for empty/null input', () => {
  assert.strictEqual(parseCommentKey(''), null);
  assert.strictEqual(parseCommentKey(null), null);
  assert.strictEqual(parseCommentKey(undefined), null);
});

// -----------------------------------------------------------------------------
// 5. findCommentByKey — locates comment by (key, sha) for dedup.
// Per tech-spec: "At most one bot comment with a given (key, sha) tuple
// may exist on the thread."
// -----------------------------------------------------------------------------

test('findCommentByKey: finds matching comment in list', () => {
  const comments = [
    {
      id: 100,
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-pr-comment
key: symbol-audit
sha: abc123
-->

Symbol audit results.`,
    },
    {
      id: 101,
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-pr-comment
key: pr-review-gemini
sha: abc123
-->

Gemini review.`,
    },
  ];
  const result = findCommentByKey(comments, 'symbol-audit', 'abc123');
  assert.strictEqual(result.id, 100);
});

test('findCommentByKey: returns null when key matches but sha differs', () => {
  const comments = [
    {
      id: 100,
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-pr-comment
key: symbol-audit
sha: abc123
-->`,
    },
  ];
  const result = findCommentByKey(comments, 'symbol-audit', 'different-sha');
  assert.strictEqual(result, null);
});

test('findCommentByKey: returns null when sha matches but key differs', () => {
  const comments = [
    {
      id: 100,
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-pr-comment
key: symbol-audit
sha: abc123
-->`,
    },
  ];
  const result = findCommentByKey(comments, 'pr-review-claude', 'abc123');
  assert.strictEqual(result, null);
});

test('findCommentByKey: ignores non-bot comments', () => {
  const comments = [
    {
      id: 100,
      user: { login: 'some-human' },
      body: `<!-- vsdd-pr-comment
key: symbol-audit
sha: abc123
-->`,
    },
  ];
  const result = findCommentByKey(comments, 'symbol-audit', 'abc123');
  assert.strictEqual(result, null);
});

test('findCommentByKey: returns null for empty comment list', () => {
  const result = findCommentByKey([], 'symbol-audit', 'abc123');
  assert.strictEqual(result, null);
});

test('findCommentByKey: handles null/undefined comments array', () => {
  assert.strictEqual(findCommentByKey(null, 'key', 'sha'), null);
  assert.strictEqual(findCommentByKey(undefined, 'key', 'sha'), null);
});

// -----------------------------------------------------------------------------
// 6. shouldAutoConvertToDraft — per tech-spec point 5.
// When isDraft=false AND blessedMarker absent, gate should attempt auto-draft.
// -----------------------------------------------------------------------------

test('shouldAutoConvertToDraft: true when ready without marker', () => {
  const result = shouldAutoConvertToDraft({ isDraft: false, blessedMarker: false });
  assert.strictEqual(result, true);
});

test('shouldAutoConvertToDraft: false when ready with marker', () => {
  const result = shouldAutoConvertToDraft({ isDraft: false, blessedMarker: true });
  assert.strictEqual(result, false);
});

test('shouldAutoConvertToDraft: false when already draft', () => {
  const result = shouldAutoConvertToDraft({ isDraft: true, blessedMarker: false });
  assert.strictEqual(result, false);
});

test('shouldAutoConvertToDraft: false when draft with marker', () => {
  const result = shouldAutoConvertToDraft({ isDraft: true, blessedMarker: true });
  assert.strictEqual(result, false);
});

// -----------------------------------------------------------------------------
// 7. Edge cases: blessed marker persistence across close/reopen.
// Per tech-spec point 9: marker persists; gate works identically.
// The marker detection is pure — it just looks for the token in comments.
// This test verifies the behavior is consistent regardless of PR state changes.
// -----------------------------------------------------------------------------

test('hasBlessedMarker: finds marker regardless of surrounding context', () => {
  const bodies = [
    '<!-- vsdd-pr-blessed -->\n',
    '\n<!-- vsdd-pr-blessed -->\n',
    'Previous content.\n\n<!-- vsdd-pr-blessed -->\n\nSubsequent content.',
    '<!-- vsdd-pr-blessed -->',
  ];
  for (const body of bodies) {
    assert.strictEqual(hasBlessedMarker(body), true, `failed for: ${JSON.stringify(body)}`);
  }
});

// -----------------------------------------------------------------------------
// 8. Grammar 1 vs Grammar 2 distinction.
// pr-blessed marker uses Grammar 1 (token-only, no sha).
// Other keyed comments use Grammar 2 (key + sha for dedup).
// -----------------------------------------------------------------------------

test('parseCommentKey: blessed marker is Grammar 1, not Grammar 2', () => {
  const body = '<!-- vsdd-pr-blessed -->\n\n_Marker content._';
  const result = parseCommentKey(body);
  assert.strictEqual(result, null);
});

test('parseCommentKey: refusal comment uses Grammar 2 with pr-refusal key', () => {
  const body = `<!-- vsdd-pr-comment
key: pr-refusal
sha: abc123def456
-->

**Auto-draft failed.** Fork PRs cannot be converted.`;
  const result = parseCommentKey(body);
  assert.deepStrictEqual(result, { key: 'pr-refusal', sha: 'abc123def456' });
});

// -----------------------------------------------------------------------------
// 9. Bot identity filtering.
// Only github-actions[bot] comments count for marker and dedup.
// -----------------------------------------------------------------------------

test('findCommentByKey: strict bot identity check', () => {
  const comments = [
    {
      id: 100,
      user: { login: 'github-actions' },
      body: `<!-- vsdd-pr-comment\nkey: test\nsha: abc\n-->`,
    },
    {
      id: 101,
      user: { login: 'dependabot[bot]' },
      body: `<!-- vsdd-pr-comment\nkey: test\nsha: abc\n-->`,
    },
    {
      id: 102,
      user: { login: 'github-actions[bot]' },
      body: `<!-- vsdd-pr-comment\nkey: test\nsha: abc\n-->`,
    },
  ];
  const result = findCommentByKey(comments, 'test', 'abc');
  assert.strictEqual(result.id, 102);
});

// -----------------------------------------------------------------------------
// 10. Concurrency invariant tests.
// The state-protection gate's output must be deterministic for the same inputs.
// -----------------------------------------------------------------------------

test('computeProceedState: deterministic output', () => {
  const inputs = [
    { isDraft: true, blessedMarker: true },
    { isDraft: true, blessedMarker: false },
    { isDraft: false, blessedMarker: true },
    { isDraft: false, blessedMarker: false },
  ];
  for (const input of inputs) {
    const r1 = computeProceedState(input);
    const r2 = computeProceedState(input);
    assert.deepStrictEqual(r1, r2, `non-deterministic for ${JSON.stringify(input)}`);
  }
});
