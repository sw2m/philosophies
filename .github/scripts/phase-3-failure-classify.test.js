#!/usr/bin/env node
// Tests for phase-3-failure-classify.js
// Covers each classification: success, timeout, api-error, crash, malformed, schema-violation

const assert = require('assert');
const {
  classifyPure,
  parseOutput,
  validateSchema,
  formatPending,
  API_ERROR_PATTERN,
  TIMEOUT_EXIT_CODES,
} = require('./phase-3-failure-classify.js');

const VALID_FRONTMATTER = `---
verdict: pass
category: multi-word
commit-sha: abc123
---

Review content here.`;

const VALID_FAIL = `---
verdict: fail
category: spec-fidelity
commit-sha: def456
---

- (blocking) Issue found.`;

let passed = 0;
let failed = 0;
let current = '';

function describe(name, fn) {
  current = name;
  console.log(`\n${name}`);
  fn();
}

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${desc}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

describe('classifyPure - success', () => {
  it('returns success for exit 0 with valid pass verdict', () => {
    const result = classifyPure({
      exitCode: '0',
      stdout: VALID_FRONTMATTER,
      stderr: '',
    });
    assert.strictEqual(result.classification, 'success');
    assert.strictEqual(result.reason, null);
    assert.strictEqual(result.parsed.verdict, 'pass');
  });

  it('returns success for "success" outcome with valid fail verdict', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: VALID_FAIL,
      stderr: '',
    });
    assert.strictEqual(result.classification, 'success');
    assert.strictEqual(result.reason, null);
    assert.strictEqual(result.parsed.verdict, 'fail');
  });

  it('returns success for bare verdict line', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: 'verdict: pass\n\nSome review.',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'success');
  });
});

describe('classifyPure - timeout', () => {
  it('classifies exit 124 as timeout', () => {
    const result = classifyPure({ exitCode: 124, stdout: '', stderr: '' });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'timeout');
  });

  it('classifies exit 137 as timeout', () => {
    const result = classifyPure({ exitCode: '137', stdout: '', stderr: '' });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'timeout');
  });
});

describe('classifyPure - api-error', () => {
  it('classifies HTTP 500 in stderr as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'Error: HTTP 500 Internal Server Error',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies HTTP 503 in stderr as api-error', () => {
    const result = classifyPure({
      exitCode: 'failure',
      stdout: '',
      stderr: 'upstream returned HTTP 503',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies rate limit in stderr as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'rate limit exceeded',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies x-ratelimit-remaining: 0 as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'x-ratelimit-remaining: 0',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies ECONNRESET as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'Error: ECONNRESET',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies ETIMEDOUT as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'connect ETIMEDOUT',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies ENOTFOUND as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'getaddrinfo ENOTFOUND api.example.com',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies EAI_AGAIN as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'getaddrinfo EAI_AGAIN',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });

  it('classifies upstream connect error as api-error', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'upstream connect error or disconnect',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'api-error');
  });
});

describe('classifyPure - crash', () => {
  it('classifies exit 1 with no api-error pattern as crash', () => {
    const result = classifyPure({
      exitCode: '1',
      stdout: '',
      stderr: 'Segmentation fault',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'crash');
  });

  it('classifies exit 139 as crash', () => {
    const result = classifyPure({
      exitCode: '139',
      stdout: '',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'crash');
  });

  it('classifies "failure" outcome with empty stderr as crash', () => {
    const result = classifyPure({
      exitCode: 'failure',
      stdout: '',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'crash');
  });
});

describe('classifyPure - malformed', () => {
  it('classifies exit 0 with empty stdout as malformed', () => {
    const result = classifyPure({
      exitCode: '0',
      stdout: '',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'malformed');
  });

  it('classifies exit 0 with no verdict in frontmatter as malformed', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: '---\ncategory: foo\n---\nContent',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'malformed');
  });

  it('classifies exit 0 with verdict: pending as malformed', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: '---\nverdict: pending\ncategory: foo\n---\n',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'malformed');
  });

  it('classifies exit 0 with invalid verdict value as malformed', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: '---\nverdict: maybe\n---\n',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'malformed');
  });

  it('classifies exit 0 with no frontmatter and no bare verdict as malformed', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: 'Here is my review without any verdict.',
      stderr: '',
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'malformed');
  });
});

describe('classifyPure - schema-violation', () => {
  it('classifies missing required field as schema-violation', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: '---\nverdict: pass\n---\nContent',
      stderr: '',
      schema: { required: ['verdict', 'category', 'commit-sha'] },
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'schema-violation');
  });

  it('classifies custom validator failure as schema-violation', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: VALID_FRONTMATTER,
      stderr: '',
      schema: {
        required: ['verdict'],
        validator: () => false,
      },
    });
    assert.strictEqual(result.classification, 'op-failure');
    assert.strictEqual(result.reason, 'schema-violation');
  });

  it('passes with valid schema', () => {
    const result = classifyPure({
      exitCode: 'success',
      stdout: VALID_FRONTMATTER,
      stderr: '',
      schema: { required: ['verdict', 'category', 'commit-sha'] },
    });
    assert.strictEqual(result.classification, 'success');
  });
});

describe('parseOutput', () => {
  it('parses valid frontmatter', () => {
    const result = parseOutput(VALID_FRONTMATTER);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.verdict, 'pass');
    assert.strictEqual(result.frontmatter.category, 'multi-word');
  });

  it('parses bare verdict line', () => {
    const result = parseOutput('verdict: fail\n\nReview.');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.verdict, 'fail');
  });

  it('handles null input', () => {
    const result = parseOutput(null);
    assert.strictEqual(result.valid, false);
  });

  it('handles empty string', () => {
    const result = parseOutput('');
    assert.strictEqual(result.valid, false);
  });
});

describe('validateSchema', () => {
  it('validates required fields', () => {
    const parsed = { frontmatter: { verdict: 'pass', category: 'foo' } };
    assert.strictEqual(
      validateSchema(parsed, { required: ['verdict', 'category'] }),
      true
    );
  });

  it('fails on missing required field', () => {
    const parsed = { frontmatter: { verdict: 'pass' } };
    assert.strictEqual(
      validateSchema(parsed, { required: ['verdict', 'category'] }),
      false
    );
  });

  it('runs custom validator', () => {
    const parsed = { frontmatter: { verdict: 'pass', category: 'foo', 'commit-sha': 'abc' } };
    assert.strictEqual(
      validateSchema(parsed, { required: [], validator: (p) => p.frontmatter.verdict === 'pass' }),
      true
    );
  });
});

describe('formatPending', () => {
  it('formats pending comment with all fields', () => {
    const result = formatPending({
      category: 'multi-word',
      reviewer: 'gemini',
      reason: 'timeout',
      sha: 'abc123',
      timestamp: '2026-05-05T12:00:00Z',
    });
    assert.ok(result.includes('<!-- vsdd-phase-3'));
    assert.ok(result.includes('category: multi-word'));
    assert.ok(result.includes('reviewer: gemini'));
    assert.ok(result.includes('verdict: pending'));
    assert.ok(result.includes('reason: timeout'));
    assert.ok(result.includes('commit-sha: abc123'));
    assert.ok(result.includes('round: pending'));
    assert.ok(result.includes('retries-exhausted: false'));
    assert.ok(result.includes('Last attempt: 2026-05-05T12:00:00Z'));
  });
});

describe('API_ERROR_PATTERN', () => {
  const patterns = [
    'HTTP 500',
    'HTTP 502',
    'HTTP 503',
    'rate limit',
    'rate-limit',
    'ratelimit',
    'x-ratelimit-remaining: 0',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'upstream connect error',
  ];

  for (const p of patterns) {
    it(`matches "${p}"`, () => {
      assert.ok(API_ERROR_PATTERN.test(p), `Expected "${p}" to match`);
    });
  }
});

describe('TIMEOUT_EXIT_CODES', () => {
  it('contains 124', () => {
    assert.ok(TIMEOUT_EXIT_CODES.has(124));
  });

  it('contains 137', () => {
    assert.ok(TIMEOUT_EXIT_CODES.has(137));
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
