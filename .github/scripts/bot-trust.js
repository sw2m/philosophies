// Bot-trust spoof-resistance validation for the ownership gate.
//
// Implements the four attack-surface defenses from sw2m/philosophies#117:
//   (a) fork PR by external user — rejected
//   (b) fork PR bearing bot identity — rejected
//   (c) non-PR event with trust opt-in but no safe-context — rejected
//   (d) non-bot non-org-member with trust opt-in — rejected
//
// Usage:
//   const { validateTrust, isSafeContext, TRUST_OPT_IN_TOKEN } =
//     require('./.github/scripts/bot-trust.js');

const TRUST_OPT_IN_TOKEN = 'bot-trust:accept';
const TRUSTED_BOT = 'github-actions[bot]';

const SAFE_EVENTS = new Set(['pull_request', 'pull_request_target']);

function isSafeContext(ctx) {
  if (ctx.isFork) return false;
  if (!SAFE_EVENTS.has(ctx.event)) return false;
  return true;
}

function validateTrust(ctx, options) {
  const { orgMembers = [] } = options || {};
  const actor = ctx.actor;

  if (ctx.isFork) {
    return { accepted: false, reason: 'Fork PRs are not trusted' };
  }

  if (!isSafeContext(ctx)) {
    return { accepted: false, reason: `Event '${ctx.event}' has no safe-context predicate` };
  }

  if (orgMembers.includes(actor)) {
    return { accepted: true, reason: 'Actor is an org member' };
  }

  if (ctx.trustOptIn && actor === TRUSTED_BOT) {
    return { accepted: true, reason: 'Trusted bot with opt-in on in-repo PR' };
  }

  if (actor === TRUSTED_BOT) {
    return { accepted: false, reason: 'Bot requires trust opt-in' };
  }

  return { accepted: false, reason: 'Actor is not an org member' };
}

module.exports = { validateTrust, isSafeContext, TRUST_OPT_IN_TOKEN };
