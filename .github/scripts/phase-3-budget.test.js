// Tests for phase-3-budget.js
// Run: node .github/scripts/phase-3-budget.test.js

const assert = require('assert');
const {
  frontmatterRegexFor,
  parseFrontmatter,
  computeSharedRound,
  latestVerdict,
  terminalState,
  buildFrontmatter,
  processReview,
} = require('./phase-3-budget.js');

function makeComment(body) {
  return { body };
}

function makeFrontmatter(opts) {
  return buildFrontmatter({
    category: opts.category || 'logic',
    reviewer: opts.reviewer || 'gemini',
    verdict: opts.verdict || 'pass',
    reason: opts.reason || null,
    commitSha: opts.commitSha || 'a'.repeat(40),
    round: opts.round || 1,
    retriesExhausted: opts.retriesExhausted || false,
  });
}

// frontmatterRegexFor
{
  const re = frontmatterRegexFor('logic', 'gemini');
  const body = `<!-- vsdd-phase-3\ncategory: logic\nreviewer: gemini\nverdict: pass\ncommit-sha: ${'a'.repeat(40)}\nround: 1\n-->`;
  assert.ok(re.test(body), 'should match valid frontmatter');

  const legacy = `<!-- vsdd-phase-3\nreviewer: gemini\nverdict: pass\n-->`;
  assert.ok(!re.test(legacy), 'should NOT match legacy (no category)');
}

// parseFrontmatter
{
  const body = `<!-- vsdd-phase-3\ncategory: security\nreviewer: claude\nverdict: fail\nreason: timeout\ncommit-sha: ${'b'.repeat(40)}\nround: 3\nretries-exhausted: true\n-->`;
  const parsed = parseFrontmatter(body);
  assert.deepStrictEqual(parsed, {
    category: 'security',
    reviewer: 'claude',
    verdict: 'fail',
    reason: 'timeout',
    commitSha: 'b'.repeat(40),
    round: 3,
    retriesExhausted: true,
  });

  const noReason = `<!-- vsdd-phase-3\ncategory: logic\nreviewer: gemini\nverdict: pass\ncommit-sha: ${'c'.repeat(40)}\nround: 2\n-->`;
  const parsed2 = parseFrontmatter(noReason);
  assert.strictEqual(parsed2.reason, null);
  assert.strictEqual(parsed2.retriesExhausted, false);

  const pending = `<!-- vsdd-phase-3\ncategory: logic\nreviewer: gemini\nverdict: pending\ncommit-sha: ${'d'.repeat(40)}\nround: pending\n-->`;
  const parsed3 = parseFrontmatter(pending);
  assert.strictEqual(parsed3.round, 'pending');
  assert.strictEqual(parsed3.verdict, 'pending');
}

// computeSharedRound: asymmetric reviewer counts
{
  const comments = [
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'gemini', verdict: 'fail', round: 1 })),
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'claude', verdict: 'fail', round: 1 })),
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'gemini', verdict: 'fail', round: 2 })),
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'gemini', verdict: 'pass', round: 3 })),
  ];
  const round = computeSharedRound(comments, 'logic');
  assert.strictEqual(round, 4, 'should be max(3,1)+1=4');
}

// computeSharedRound: excludes pending
{
  const comments = [
    makeComment(makeFrontmatter({ category: 'security', reviewer: 'gemini', verdict: 'fail', round: 1 })),
    makeComment(makeFrontmatter({ category: 'security', reviewer: 'claude', verdict: 'fail', round: 1 })),
    makeComment(makeFrontmatter({ category: 'security', reviewer: 'gemini', verdict: 'pending', round: 2 })),
  ];
  const round = computeSharedRound(comments, 'security');
  assert.strictEqual(round, 2, 'pending should not count; max(1,1)+1=2');
}

// computeSharedRound: pagination across 50-comment fixture
{
  const comments = [];
  for (let i = 1; i <= 25; i++) {
    comments.push(makeComment(makeFrontmatter({ category: 'perf', reviewer: 'gemini', verdict: 'fail', round: i })));
  }
  for (let i = 1; i <= 25; i++) {
    comments.push(makeComment(makeFrontmatter({ category: 'perf', reviewer: 'claude', verdict: 'fail', round: i })));
  }
  const round = computeSharedRound(comments, 'perf');
  assert.strictEqual(round, 26, 'max(25,25)+1=26 across 50 comments');
}

// computeSharedRound: legacy comments ignored
{
  const legacy = `<!-- vsdd-phase-3\nreviewer: gemini\nverdict: pass\ncommit-sha: ${'e'.repeat(40)}\nround: 1\n-->`;
  const comments = [
    makeComment(legacy),
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'gemini', verdict: 'fail', round: 1 })),
  ];
  const round = computeSharedRound(comments, 'logic');
  assert.strictEqual(round, 2, 'legacy comment without category should be ignored');
}

// latestVerdict: sees pending verdict
{
  const comments = [
    makeComment(makeFrontmatter({ category: 'docs', reviewer: 'claude', verdict: 'fail', round: 1 })),
    makeComment(makeFrontmatter({ category: 'docs', reviewer: 'claude', verdict: 'pending', round: 'pending' })),
  ];
  const latest = latestVerdict(comments, 'docs', 'claude');
  assert.strictEqual(latest.verdict, 'pending', 'latestVerdict should see pending verdict');
  assert.strictEqual(latest.round, 'pending', 'round can also be pending');
}

// latestVerdict: returns null when no match
{
  const comments = [
    makeComment(makeFrontmatter({ category: 'logic', reviewer: 'gemini', verdict: 'pass', round: 1 })),
  ];
  const latest = latestVerdict(comments, 'logic', 'claude');
  assert.strictEqual(latest, null, 'should return null for non-matching reviewer');
}

// terminalState: distinguishes inapplicable from content-pass
{
  const contentPass = { verdict: 'pass', reason: null };
  assert.strictEqual(terminalState(contentPass), true, 'pass without reason is terminal');

  const inapplicable = { verdict: 'pass', reason: 'inapplicable' };
  assert.strictEqual(terminalState(inapplicable), false, 'pass with inapplicable is NOT terminal');

  const forcePass = { verdict: 'pass', reason: 'force-pass' };
  assert.strictEqual(terminalState(forcePass), true, 'pass with force-pass IS terminal');

  const fail = { verdict: 'fail', reason: null };
  assert.strictEqual(terminalState(fail), false, 'fail is not terminal');

  assert.strictEqual(terminalState(null), false, 'null is not terminal');
}

// processReview: splices canonical frontmatter
{
  const result = processReview({
    body: 'Review content.\n\n_Verdict: `pass`_\n',
    round: 2,
    budget: 5,
    category: 'logic',
    reviewer: 'gemini',
    commitSha: 'f'.repeat(40),
  });
  assert.ok(result.body.startsWith('<!-- vsdd-phase-3'), 'should start with frontmatter');
  assert.ok(result.body.includes('category: logic'), 'should include category');
  assert.ok(result.body.includes('reviewer: gemini'), 'should include reviewer');
  assert.ok(result.body.includes('round: 2'), 'should include round');
  assert.strictEqual(result.verdict, 'pass');
}

// processReview: demotes excess blockers
{
  const body = '- `(blocking)` Issue 1\n- `(blocking)` Issue 2\n- `(blocking)` Issue 3\n\n_Verdict: `fail`_\n';
  const result = processReview({
    body,
    round: 4,
    budget: 1,
    category: 'security',
    reviewer: 'claude',
    commitSha: 'a'.repeat(40),
  });
  assert.strictEqual(result.demoted, 2, 'should demote 2 blockers');
  assert.ok(result.body.includes('(advisory; over-budget)'), 'should contain demotion marker');
}

console.log('All tests passed.');
