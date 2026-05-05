'use strict';

const assert = require('assert');
const { CATEGORIES, name, conclude, title, summary } = require('./phase-3-checkruns.js');

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${desc}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${desc}`);
    console.error(`  ${e.message}`);
  }
}

test('CATEGORIES has 6 slugs', () => {
  assert.strictEqual(Object.keys(CATEGORIES).length, 6);
});

test('name() returns per-reviewer name with reviewer', () => {
  assert.strictEqual(name('multi-word-symbols', 'gemini'), 'Phase 3 / Multi-word symbols (§IX) — gemini');
  assert.strictEqual(name('multi-word-symbols', 'claude'), 'Phase 3 / Multi-word symbols (§IX) — claude');
});

test('name() returns per-category aggregate without reviewer', () => {
  assert.strictEqual(name('error-structure', null), 'Phase 3 / Error structure (§IX)');
  assert.strictEqual(name('security-surface'), 'Phase 3 / Security surface (§II)');
});

test('name() throws for unknown slug', () => {
  assert.throws(() => name('unknown-slug', 'gemini'), /Unknown category slug/);
});

test('conclude() returns failure if gemini=fail', () => {
  assert.strictEqual(conclude('fail', 'pass'), 'failure');
  assert.strictEqual(conclude('fail', 'fail'), 'failure');
  assert.strictEqual(conclude('fail', 'pending'), 'failure');
});

test('conclude() returns failure if claude=fail', () => {
  assert.strictEqual(conclude('pass', 'fail'), 'failure');
  assert.strictEqual(conclude('pending', 'fail'), 'failure');
});

test('conclude() returns action_required if gemini=pending', () => {
  assert.strictEqual(conclude('pending', 'pass'), 'action_required');
  assert.strictEqual(conclude('pending', 'pending'), 'action_required');
});

test('conclude() returns action_required if claude=pending', () => {
  assert.strictEqual(conclude('pass', 'pending'), 'action_required');
});

test('conclude() returns success only if both pass', () => {
  assert.strictEqual(conclude('pass', 'pass'), 'success');
});

test('conclude() returns action_required for unknown verdicts', () => {
  assert.strictEqual(conclude('unknown', 'pass'), 'action_required');
  assert.strictEqual(conclude('pass', 'unknown'), 'action_required');
  assert.strictEqual(conclude(null, null), 'action_required');
});

test('title() formats active title', () => {
  assert.strictEqual(title(1, 'pass'), 'round 1: pass');
  assert.strictEqual(title(2, 'fail'), 'round 2: fail');
  assert.strictEqual(title(3, 'pass (force-pass)'), 'round 3: pass (force-pass)');
});

test('title() formats stale title with 8-char SHAs', () => {
  const t = title(1, 'pass', {
    stale: true,
    terminal: 'abc123def456789',
    head: '987654321fedcba',
  });
  assert.strictEqual(t, 'terminal-stated at abc123de; HEAD 98765432 not reviewed');
});

test('title() ignores stale opts if incomplete', () => {
  assert.strictEqual(title(1, 'pass', { stale: true }), 'round 1: pass');
  assert.strictEqual(title(1, 'pass', { stale: true, terminal: 'abc' }), 'round 1: pass');
});

test('summary() returns body unchanged when not stale', () => {
  assert.strictEqual(summary('some body'), 'some body');
  assert.strictEqual(summary('body', { stale: false }), 'body');
});

test('summary() prepends stale annotation', () => {
  const s = summary('review content', { stale: true, terminal: 'abc123def456' });
  assert(s.startsWith('Stale: this category terminal-stated at abc123de'));
  assert(s.includes('review content'));
});

test('cancel() title format includes round and cancelled mid-run', () => {
  const { cancel } = require('./phase-3-checkruns.js');
  let captured = null;
  const mock = {
    rest: {
      checks: {
        update: async (opts) => { captured = opts; },
      },
    },
  };
  const ctx = { repo: { owner: 'o', repo: 'r' } };
  cancel(mock, ctx, 123, { round: 2 });
  assert.strictEqual(captured.check_run_id, 123);
  assert.strictEqual(captured.conclusion, 'cancelled');
  assert.strictEqual(captured.output.title, 'round 2: cancelled mid-run');
});

test('inapplicable() creates check with correct title', () => {
  const { inapplicable } = require('./phase-3-checkruns.js');
  let captured = null;
  const mock = {
    rest: {
      checks: {
        create: async (opts) => { captured = opts; },
      },
    },
  };
  const ctx = { repo: { owner: 'o', repo: 'r' } };
  inapplicable(mock, ctx, 'spec-gaps', 'abc123');
  assert.strictEqual(captured.name, 'Phase 3 / Spec gaps (§II)');
  assert.strictEqual(captured.conclusion, 'success');
  assert.strictEqual(captured.output.title, 'round 1: pass (inapplicable)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
