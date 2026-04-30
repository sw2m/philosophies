// Phase 2a Red-Gate suite for sw2m/philosophies#115.
//
// Tech-spec: Composite action bot-trust implementation.
// The gemini and claude composite actions must include a bot-trust
// short-circuit BEFORE the org-member API check. When trust_bot="true"
// AND ACTOR="github-actions[bot]", ownership is accepted without
// calling the org-member API.
//
// Run with: node --test tests/issue-115-bot-trust.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const GEMINI_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'actions',
  'gemini',
  'action.yml',
);

const CLAUDE_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'actions',
  'claude',
  'action.yml',
);

const gemini = fs.readFileSync(GEMINI_PATH, 'utf8');
const claude = fs.readFileSync(CLAUDE_PATH, 'utf8');

// -----------------------------------------------------------------------------
// 1. Bot-trust short-circuit presence.
// The ownership step must contain a conditional that checks trust_bot.
// -----------------------------------------------------------------------------

test('gemini: ownership step must contain trust_bot conditional', () => {
  // The implementation must normalize INPUT_TRUST_BOT and check it.
  // Pattern: trust_bot=$(printf '%s' "${INPUT_TRUST_BOT:-}" | tr ...
  // or similar normalization followed by [ "${trust_bot}" = "true" ]
  const pattern = /trust_bot=.*\$\{INPUT_TRUST_BOT/;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml missing trust_bot variable assignment from INPUT_TRUST_BOT',
  );
});

test('claude: ownership step must contain trust_bot conditional', () => {
  const pattern = /trust_bot=.*\$\{INPUT_TRUST_BOT/;
  assert.match(
    claude,
    pattern,
    'claude action.yml missing trust_bot variable assignment from INPUT_TRUST_BOT',
  );
});

// -----------------------------------------------------------------------------
// 2. Both guards required: trust_bot="true" AND ACTOR="github-actions[bot]".
// The short-circuit must require BOTH conditions, not just one.
// -----------------------------------------------------------------------------

test('gemini: short-circuit guards both trust_bot and ACTOR identity', () => {
  // Must have a compound condition: trust_bot = "true" && ACTOR = "github-actions[bot]"
  // Order may vary; check for presence of both checks in a compound if.
  const pattern =
    /if\s+\[.*trust_bot.*=.*"true".*\].*&&.*\[.*ACTOR.*=.*"github-actions\[bot\]".*\]/s;
  const alt =
    /if\s+\[.*ACTOR.*=.*"github-actions\[bot\]".*\].*&&.*\[.*trust_bot.*=.*"true".*\]/s;
  assert.ok(
    pattern.test(gemini) || alt.test(gemini),
    'gemini action.yml missing compound guard: trust_bot="true" && ACTOR="github-actions[bot]"',
  );
});

test('claude: short-circuit guards both trust_bot and ACTOR identity', () => {
  const pattern =
    /if\s+\[.*trust_bot.*=.*"true".*\].*&&.*\[.*ACTOR.*=.*"github-actions\[bot\]".*\]/s;
  const alt =
    /if\s+\[.*ACTOR.*=.*"github-actions\[bot\]".*\].*&&.*\[.*trust_bot.*=.*"true".*\]/s;
  assert.ok(
    pattern.test(claude) || alt.test(claude),
    'claude action.yml missing compound guard: trust_bot="true" && ACTOR="github-actions[bot]"',
  );
});

// -----------------------------------------------------------------------------
// 3. Notice message on short-circuit entry.
// When the short-circuit is entered, a notice must be emitted.
// -----------------------------------------------------------------------------

test('gemini: emits notice when accepting github-actions[bot]', () => {
  const pattern = /::notice::.*github-actions\[bot\].*trust/i;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml missing notice message for bot-trust short-circuit',
  );
});

test('claude: emits notice when accepting github-actions[bot]', () => {
  const pattern = /::notice::.*github-actions\[bot\].*trust/i;
  assert.match(
    claude,
    pattern,
    'claude action.yml missing notice message for bot-trust short-circuit',
  );
});

// -----------------------------------------------------------------------------
// 4. Org-member check preserved in else branch.
// The short-circuit must NOT replace the org-member check entirely.
// The gh api call must still exist for non-bot or no-trust cases.
// -----------------------------------------------------------------------------

test('gemini: org-member API check still present', () => {
  // The existing org-member check: gh api "orgs/$ORG/members/$ACTOR"
  const pattern = /gh\s+api\s+["']?orgs\/\$[{]?ORG[}]?\/members\/\$[{]?ACTOR/;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml missing org-member API check (should be in else branch)',
  );
});

test('claude: org-member API check still present', () => {
  const pattern = /gh\s+api\s+["']?orgs\/\$[{]?ORG[}]?\/members\/\$[{]?ACTOR/;
  assert.match(
    claude,
    pattern,
    'claude action.yml missing org-member API check (should be in else branch)',
  );
});

// -----------------------------------------------------------------------------
// 5. Structural: short-circuit uses if/else, not early exit.
// Per tech-spec: "Use if/else (not exit 0) so subsequent commands still run."
// The short-circuit branch must NOT contain exit 0.
// -----------------------------------------------------------------------------

test('gemini: bot-trust block does not exit 0 (uses if/else structure)', () => {
  // Find the trust_bot conditional block and ensure it doesn't exit 0
  // in the truthy branch. This is a heuristic: look for the notice line
  // and ensure no exit 0 nearby before an else.
  const notice = gemini.indexOf('::notice::');
  if (notice === -1) {
    assert.fail('no notice found (test 3 should have caught this)');
  }
  // Find the next "else" or "fi" after the notice
  const after = gemini.slice(notice, notice + 200);
  // If there's an "exit 0" before "else" in this window, that's wrong
  const exit0 = /exit\s+0/.test(after.split(/\belse\b/)[0] || '');
  assert.ok(
    !exit0,
    'gemini action.yml has exit 0 in bot-trust branch (should use if/else, not early exit)',
  );
});

test('claude: bot-trust block does not exit 0 (uses if/else structure)', () => {
  const notice = claude.indexOf('::notice::');
  if (notice === -1) {
    assert.fail('no notice found (test 3 should have caught this)');
  }
  const after = claude.slice(notice, notice + 200);
  const exit0 = /exit\s+0/.test(after.split(/\belse\b/)[0] || '');
  assert.ok(
    !exit0,
    'claude action.yml has exit 0 in bot-trust branch (should use if/else, not early exit)',
  );
});

// -----------------------------------------------------------------------------
// 6. Actor resolution unchanged.
// ACTOR="${ACTOR_OVERRIDE:-${GITHUB_ACTOR}}" or equivalent must still exist.
// -----------------------------------------------------------------------------

test('gemini: actor resolution pattern preserved', () => {
  // Look for ACTOR assignment from OVERRIDE or SENDER/GITHUB_ACTOR
  const pattern = /ACTOR="\$\{OVERRIDE:-\$SENDER\}"/;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml actor resolution changed (should be ACTOR="${OVERRIDE:-$SENDER}")',
  );
});

test('claude: actor resolution pattern preserved', () => {
  const pattern = /ACTOR="\$\{OVERRIDE:-\$SENDER\}"/;
  assert.match(
    claude,
    pattern,
    'claude action.yml actor resolution changed (should be ACTOR="${OVERRIDE:-$SENDER}")',
  );
});

// -----------------------------------------------------------------------------
// 7. Non-tautological: strict string comparison.
// The trust_bot check must use = "true" (strict), not -n or similar.
// This ensures "TRUE", "yes", "1" are rejected per the truth table.
// -----------------------------------------------------------------------------

test('gemini: trust_bot comparison is strict equality to "true"', () => {
  // Must be: [ "${trust_bot}" = "true" ] — not [ -n "${trust_bot}" ]
  const pattern = /\[\s*"\$\{?trust_bot\}?"\s*=\s*"true"\s*\]/;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml trust_bot check must use strict = "true" comparison',
  );
});

test('claude: trust_bot comparison is strict equality to "true"', () => {
  const pattern = /\[\s*"\$\{?trust_bot\}?"\s*=\s*"true"\s*\]/;
  assert.match(
    claude,
    pattern,
    'claude action.yml trust_bot check must use strict = "true" comparison',
  );
});

// -----------------------------------------------------------------------------
// 8. Non-tautological: ACTOR comparison is exact string match.
// Must be exactly "github-actions[bot]", not a regex or prefix match.
// -----------------------------------------------------------------------------

test('gemini: ACTOR check is exact match to github-actions[bot]', () => {
  const pattern = /\[\s*"\$\{?ACTOR\}?"\s*=\s*"github-actions\[bot\]"\s*\]/;
  assert.match(
    gemini,
    pattern,
    'gemini action.yml ACTOR check must use exact = "github-actions[bot]" comparison',
  );
});

test('claude: ACTOR check is exact match to github-actions[bot]', () => {
  const pattern = /\[\s*"\$\{?ACTOR\}?"\s*=\s*"github-actions\[bot\]"\s*\]/;
  assert.match(
    claude,
    pattern,
    'claude action.yml ACTOR check must use exact = "github-actions[bot]" comparison',
  );
});
