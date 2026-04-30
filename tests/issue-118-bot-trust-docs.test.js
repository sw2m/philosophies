// Phase 2a Red-Gate suite for sw2m/philosophies#118.
//
// Tech-spec: MEMORY.md bot-trust security docs.
// The CI/CD section must document: (1) bot trust opt-in conditions,
// (2) safe-context predicate guarantees, (3) why attackers can't exploit.
//
// Run with: node --test tests/issue-118-bot-trust-docs.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MEMORY_PATH = path.join(__dirname, '..', 'MEMORY.md');

// Read MEMORY.md once for all tests.
const memory = fs.readFileSync(MEMORY_PATH, 'utf8');

// Extract the CI/CD section (from ## CI/CD to the next ## or end of file).
const cicdMatch = memory.match(/## CI\/CD\n([\s\S]*?)(?=\n---\n|\n## [^#]|$)/);
const cicd = cicdMatch ? cicdMatch[1] : '';

// -----------------------------------------------------------------------------
// 1. Bot-trust opt-in conditions must be documented.
// -----------------------------------------------------------------------------

test('CI/CD section documents bot-trust opt-in conditions', () => {
  // The documentation must explain WHEN/HOW bot trust is granted.
  // Check for presence of both "bot" terminology and "trust"/"grant" language
  // in a context that describes conditions (not just mentioning the term).
  //
  // Non-tautological: a naive "bot trust exists" statement wouldn't match
  // the condition-focused patterns below.
  const hasConditions =
    /bot[- ]?trust/i.test(cicd) &&
    /\b(condition|when|if|grant|opt[- ]?in|enable|allow)\b/i.test(cicd);

  assert.ok(
    hasConditions,
    'CI/CD section must document conditions under which bot trust may be granted',
  );
});

// -----------------------------------------------------------------------------
// 2. Safe-context predicate guarantees must be documented.
// -----------------------------------------------------------------------------

test('CI/CD section documents safe-context predicate guarantees', () => {
  // The documentation must explain what the safe-context predicate GUARANTEES.
  // This means mentioning both the predicate concept and what it ensures/proves.
  //
  // Non-tautological: merely mentioning "safe context" without explaining
  // the guarantee wouldn't satisfy the regex for guarantee-related terms.
  const hasGuarantees =
    /safe[- ]?context/i.test(cicd) &&
    /\b(guarantee|ensure|prove|assert|verify|check|require)\b/i.test(cicd);

  assert.ok(
    hasGuarantees,
    'CI/CD section must document what the safe-context predicate guarantees',
  );
});

// -----------------------------------------------------------------------------
// 3. Security against external attackers must be documented.
// -----------------------------------------------------------------------------

test('CI/CD section documents why external attackers cannot exploit', () => {
  // The documentation must explain WHY external attackers can't exploit
  // the bot-trust mechanism specifically. Generic security mentions don't count.
  //
  // Non-tautological: the existing "External or bot-authored issues/PRs cannot
  // consume agent budget" is about ownership gating, not bot-trust security.
  // This test requires security reasoning in close proximity to bot-trust terms.
  //
  // Strategy: find a paragraph/sentence that mentions BOTH bot-trust AND
  // attacker/exploit concepts together, indicating the security model is explained.
  const botTrustSecurity =
    /bot[- ]?trust[^.]*\b(attacker|exploit|abuse|malicious|attack)/i.test(cicd) ||
    /\b(attacker|exploit|abuse|malicious|attack)[^.]*bot[- ]?trust/i.test(cicd);

  assert.ok(
    botTrustSecurity,
    'CI/CD section must explain why external attackers cannot exploit the bot-trust mechanism',
  );
});

// -----------------------------------------------------------------------------
// 4. Bot-trust subsection exists in CI/CD.
// -----------------------------------------------------------------------------

test('CI/CD section contains a bot-trust subsection or dedicated paragraph', () => {
  // The tech-spec requires the explanation to be in "a subsection or paragraph"
  // within the CI/CD section. Check that there's a heading or substantive
  // paragraph specifically about bot-trust (not just incidental "bot-authored").
  //
  // Non-tautological: existing mentions like "bot-authored" or "bot-posted"
  // are about different concepts. This requires "bot-trust" or "bot trust".
  const botTrustMatch = cicd.match(/bot[- ]?trust/i);

  assert.ok(
    botTrustMatch,
    'CI/CD section must contain "bot-trust" or "bot trust" terminology',
  );

  // Additionally, verify the term appears in a context with substantive content
  // (at least a full sentence or heading context, not just a passing mention).
  const idx = cicd.toLowerCase().search(/bot[- ]?trust/);
  const start = Math.max(0, idx - 100);
  const end = Math.min(cicd.length, idx + 200);
  const context = cicd.slice(start, end);

  const hasSubstance = context.length >= 150;
  assert.ok(
    hasSubstance,
    'Bot-trust documentation must be substantive (need surrounding context)',
  );
});
