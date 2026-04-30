// Phase 2a Red-Gate suite for sw2m/philosophies#117.
//
// Tech-spec: Bot-trust spoof-resistance tests.
// Tests the 4 attack surfaces from Outcome 7 of goal issue #112:
//   (a) fork PR by external user
//   (b) fork PR bearing bot identity
//   (c) non-PR event with trust opt-in but no defined safe-context
//   (d) non-bot non-org-member with trust opt-in
//
// Run with: node --test tests/issue-117-bot-trust-spoof.test.js

const { test } = require('node:test');
const assert = require('node:assert');

// The trust-validation module that Phase 4 will implement.
// This require will throw until the module exists (Red Gate expects failure).
const {
  validateTrust,
  isSafeContext,
  TRUST_OPT_IN_TOKEN,
} = require('../.github/scripts/bot-trust.js');

// -----------------------------------------------------------------------------
// Helper: mock context builders for different attack scenarios.
// -----------------------------------------------------------------------------

function forkPrContext(actor, isFork, trustOptIn = false) {
  return {
    event: 'pull_request',
    actor,
    isFork,
    trustOptIn,
    eventPayload: {
      pull_request: {
        head: { repo: { fork: isFork } },
        user: { login: actor },
      },
    },
  };
}

function nonPrContext(event, actor, trustOptIn = false) {
  return {
    event,
    actor,
    isFork: false,
    trustOptIn,
    eventPayload: {},
  };
}

// -----------------------------------------------------------------------------
// Attack surface (a): Fork PR by external user.
// The ownership gate must reject even if trust opt-in is set.
// -----------------------------------------------------------------------------

test('(a) fork PR by external user: rejected even with trust opt-in', () => {
  const ctx = forkPrContext('external-user', true, true);
  const result = validateTrust(ctx, { orgMembers: ['org-member'] });

  assert.strictEqual(
    result.accepted,
    false,
    'fork PR by external user must be rejected',
  );
  assert.match(
    result.reason,
    /fork/i,
    'rejection reason should mention fork',
  );
});

test('(a) fork PR by external user: rejected without trust opt-in', () => {
  const ctx = forkPrContext('external-user', true, false);
  const result = validateTrust(ctx, { orgMembers: ['org-member'] });

  assert.strictEqual(result.accepted, false);
});

// -----------------------------------------------------------------------------
// Attack surface (b): Fork PR bearing bot identity.
// Even if somehow the actor is github-actions[bot], fork PRs are rejected.
// -----------------------------------------------------------------------------

test('(b) fork PR bearing bot identity: rejected', () => {
  const ctx = forkPrContext('github-actions[bot]', true, true);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    false,
    'fork PR with bot identity must be rejected',
  );
  assert.match(
    result.reason,
    /fork/i,
    'rejection reason should mention fork',
  );
});

test('(b) fork PR bearing bot identity: isFork flag is authoritative', () => {
  // Even if trust is opted in and actor is the bot, fork = true means reject.
  const ctx = forkPrContext('github-actions[bot]', true, true);
  assert.strictEqual(
    isSafeContext(ctx),
    false,
    'fork context is never safe regardless of actor',
  );
});

// -----------------------------------------------------------------------------
// Attack surface (c): Non-PR event with trust opt-in but no safe-context.
// Events like workflow_dispatch, repository_dispatch, schedule, etc. need
// their own safe-context predicates. Without one, trust opt-in has no effect.
// -----------------------------------------------------------------------------

test('(c) workflow_dispatch with trust opt-in: rejected (no safe-context)', () => {
  const ctx = nonPrContext('workflow_dispatch', 'github-actions[bot]', true);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    false,
    'workflow_dispatch without safe-context predicate must reject',
  );
});

test('(c) repository_dispatch with trust opt-in: rejected (no safe-context)', () => {
  const ctx = nonPrContext('repository_dispatch', 'github-actions[bot]', true);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    false,
    'repository_dispatch without safe-context predicate must reject',
  );
});

test('(c) schedule event with trust opt-in: rejected (no safe-context)', () => {
  const ctx = nonPrContext('schedule', 'github-actions[bot]', true);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    false,
    'schedule event without safe-context predicate must reject',
  );
});

test('(c) isSafeContext returns false for events without defined predicates', () => {
  const events = ['workflow_dispatch', 'repository_dispatch', 'schedule'];
  for (const event of events) {
    const ctx = nonPrContext(event, 'github-actions[bot]', true);
    assert.strictEqual(
      isSafeContext(ctx),
      false,
      `${event} should not be a safe context by default`,
    );
  }
});

// -----------------------------------------------------------------------------
// Attack surface (d): Non-bot non-org-member with trust opt-in.
// Trust opt-in must not weaken enforcement for regular users.
// -----------------------------------------------------------------------------

test('(d) non-bot non-org-member with trust opt-in: rejected', () => {
  // In-repo PR (not fork), trust opted in, but actor is not org member.
  const ctx = forkPrContext('attacker', false, true);
  const result = validateTrust(ctx, { orgMembers: ['org-member'] });

  assert.strictEqual(
    result.accepted,
    false,
    'non-org-member with trust opt-in must be rejected',
  );
  assert.match(
    result.reason,
    /not.*member|org/i,
    'rejection should mention org membership',
  );
});

test('(d) trust opt-in does not bypass org-member check for users', () => {
  // Multiple non-member users, all rejected despite trust opt-in.
  const nonMembers = ['random-user', 'fork-contributor', 'dependabot[bot]'];
  for (const actor of nonMembers) {
    const ctx = forkPrContext(actor, false, true);
    const result = validateTrust(ctx, { orgMembers: ['org-member'] });

    assert.strictEqual(
      result.accepted,
      false,
      `${actor} should be rejected even with trust opt-in`,
    );
  }
});

test('(d) github-actions[bot] is the ONLY bot that trust opt-in affects', () => {
  // Other bots like dependabot[bot] are still rejected.
  const otherBots = ['dependabot[bot]', 'renovate[bot]', 'custom-app[bot]'];
  for (const bot of otherBots) {
    const ctx = forkPrContext(bot, false, true);
    const result = validateTrust(ctx, { orgMembers: [] });

    assert.strictEqual(
      result.accepted,
      false,
      `${bot} must be rejected — trust only applies to github-actions[bot]`,
    );
  }
});

// -----------------------------------------------------------------------------
// Positive case: github-actions[bot] on in-repo PR with trust opt-in.
// This is the ONLY scenario where trust acceptance should occur.
// -----------------------------------------------------------------------------

test('positive: github-actions[bot] on in-repo PR with trust opt-in: accepted', () => {
  const ctx = forkPrContext('github-actions[bot]', false, true);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    true,
    'github-actions[bot] on in-repo PR with trust opt-in should be accepted',
  );
});

test('positive: isSafeContext returns true for in-repo pull_request', () => {
  const ctx = forkPrContext('github-actions[bot]', false, true);
  assert.strictEqual(
    isSafeContext(ctx),
    true,
    'in-repo pull_request is a safe context',
  );
});

// -----------------------------------------------------------------------------
// Trust opt-in token is auditable (single-search-locatable).
// -----------------------------------------------------------------------------

test('TRUST_OPT_IN_TOKEN is defined and non-empty', () => {
  assert.ok(TRUST_OPT_IN_TOKEN, 'TRUST_OPT_IN_TOKEN must be defined');
  assert.strictEqual(
    typeof TRUST_OPT_IN_TOKEN,
    'string',
    'TRUST_OPT_IN_TOKEN must be a string',
  );
  assert.ok(
    TRUST_OPT_IN_TOKEN.length > 0,
    'TRUST_OPT_IN_TOKEN must be non-empty',
  );
});

// -----------------------------------------------------------------------------
// Default behavior (no trust opt-in): bot is rejected.
// -----------------------------------------------------------------------------

test('default: github-actions[bot] without trust opt-in is rejected', () => {
  const ctx = forkPrContext('github-actions[bot]', false, false);
  const result = validateTrust(ctx, { orgMembers: [] });

  assert.strictEqual(
    result.accepted,
    false,
    'bot without trust opt-in must be rejected (default behavior)',
  );
});

test('default: org member without trust opt-in is accepted', () => {
  const ctx = forkPrContext('org-member', false, false);
  const result = validateTrust(ctx, { orgMembers: ['org-member'] });

  assert.strictEqual(
    result.accepted,
    true,
    'org member should be accepted without trust opt-in',
  );
});
