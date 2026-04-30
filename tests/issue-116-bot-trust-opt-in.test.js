// Phase 2a Red-Gate suite for sw2m/philosophies#116.
//
// Tech-spec: ci-meta/pr-review bot-trust opt-in.
// The two workflows (ci-meta.yml, pr-review.yml) must pass the
// `trust-github-actions-bot` input to their gemini/claude composite
// action invocations with the correct safe-context predicate.
//
// Run with: node --test tests/issue-116-bot-trust-opt-in.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PR_REVIEW_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'pr-review.yml',
);

const CI_META_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'ci-meta.yml',
);

// The safe-context predicate per #114: evaluates to 'true' only when the
// PR's head branch is in the same repo (not a fork).
const PREDICATE = '${{ github.event.pull_request.head.repo.full_name == github.repository }}';

// Read workflow files once for all tests.
const prReview = fs.readFileSync(PR_REVIEW_PATH, 'utf8');
const ciMeta = fs.readFileSync(CI_META_PATH, 'utf8');

// -----------------------------------------------------------------------------
// 1. pr-review.yml gemini-review passes trust-github-actions-bot with predicate.
// -----------------------------------------------------------------------------

test('pr-review.yml gemini-review must pass trust-github-actions-bot with correct predicate', () => {
  // The gemini-review job invokes sw2m/philosophies/.github/actions/gemini@main.
  // It must include `trust-github-actions-bot: <PREDICATE>` in its with: block.
  // We match the pattern: the action invocation followed by with: containing
  // the trust input with the exact predicate value.
  const pattern = /uses:\s*sw2m\/philosophies\/\.github\/actions\/gemini@main[\s\S]*?trust-github-actions-bot:\s*\$\{\{\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}\}/;
  assert.match(
    prReview,
    pattern,
    'pr-review.yml gemini-review job does not pass trust-github-actions-bot with the correct predicate',
  );
});

// -----------------------------------------------------------------------------
// 2. pr-review.yml claude-review passes trust-github-actions-bot with predicate.
// -----------------------------------------------------------------------------

test('pr-review.yml claude-review must pass trust-github-actions-bot with correct predicate', () => {
  // The claude-review job invokes sw2m/philosophies/.github/actions/claude@main.
  // Same contract as gemini-review.
  const pattern = /uses:\s*sw2m\/philosophies\/\.github\/actions\/claude@main[\s\S]*?trust-github-actions-bot:\s*\$\{\{\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}\}/;
  assert.match(
    prReview,
    pattern,
    'pr-review.yml claude-review job does not pass trust-github-actions-bot with the correct predicate',
  );
});

// -----------------------------------------------------------------------------
// 3. ci-meta.yml gemini-eval passes trust-github-actions-bot with predicate.
// -----------------------------------------------------------------------------

test('ci-meta.yml gemini-eval must pass trust-github-actions-bot with correct predicate', () => {
  // The gemini-eval job invokes sw2m/philosophies/.github/actions/gemini@main.
  const pattern = /uses:\s*sw2m\/philosophies\/\.github\/actions\/gemini@main[\s\S]*?trust-github-actions-bot:\s*\$\{\{\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}\}/;
  assert.match(
    ciMeta,
    pattern,
    'ci-meta.yml gemini-eval job does not pass trust-github-actions-bot with the correct predicate',
  );
});

// -----------------------------------------------------------------------------
// 4. ci-meta.yml claude-eval passes trust-github-actions-bot with predicate.
// -----------------------------------------------------------------------------

test('ci-meta.yml claude-eval must pass trust-github-actions-bot with correct predicate', () => {
  // The claude-eval job invokes sw2m/philosophies/.github/actions/claude@main.
  const pattern = /uses:\s*sw2m\/philosophies\/\.github\/actions\/claude@main[\s\S]*?trust-github-actions-bot:\s*\$\{\{\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}\}/;
  assert.match(
    ciMeta,
    pattern,
    'ci-meta.yml claude-eval job does not pass trust-github-actions-bot with the correct predicate',
  );
});

// -----------------------------------------------------------------------------
// 5. Exactly 4 occurrences across both workflows (auditability per #112).
// -----------------------------------------------------------------------------

test('trust-github-actions-bot must appear exactly 4 times across pr-review.yml and ci-meta.yml', () => {
  // Per the tech-spec's "Done when" criteria: a grep enumerates exactly
  // four occurrences (two per workflow).
  const prReviewMatches = (prReview.match(/trust-github-actions-bot/g) || []).length;
  const ciMetaMatches = (ciMeta.match(/trust-github-actions-bot/g) || []).length;
  const total = prReviewMatches + ciMetaMatches;

  assert.strictEqual(
    prReviewMatches,
    2,
    `pr-review.yml should have exactly 2 trust-github-actions-bot occurrences, found ${prReviewMatches}`,
  );
  assert.strictEqual(
    ciMetaMatches,
    2,
    `ci-meta.yml should have exactly 2 trust-github-actions-bot occurrences, found ${ciMetaMatches}`,
  );
  assert.strictEqual(
    total,
    4,
    `Total trust-github-actions-bot occurrences should be 4, found ${total}`,
  );
});

// -----------------------------------------------------------------------------
// 6. Non-tautological: the predicate must NOT be a literal 'true' or 'false'.
// -----------------------------------------------------------------------------

test('trust-github-actions-bot values must not be literal true/false', () => {
  // A naive implementation might hardcode `trust-github-actions-bot: true`
  // which would grant trust unconditionally. The predicate must be the
  // dynamic expression that evaluates at runtime.
  //
  // Match any trust-github-actions-bot line followed by a simple literal.
  const literalTruePattern = /trust-github-actions-bot:\s*(true|false|'true'|'false'|"true"|"false")\s*$/m;

  assert.doesNotMatch(
    prReview,
    literalTruePattern,
    'pr-review.yml has a literal true/false for trust-github-actions-bot — must use the dynamic predicate',
  );
  assert.doesNotMatch(
    ciMeta,
    literalTruePattern,
    'ci-meta.yml has a literal true/false for trust-github-actions-bot — must use the dynamic predicate',
  );
});
