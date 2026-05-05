// Tests for phase-3-multi-word-clusters.js
// Spec: sw2m/philosophies#183

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseClusters,
  validateClusters,
  clusterCount,
  extractFlatSymbolsFromFailedParse,
  rewriteCommentWithClusterCount,
  reproducible,
} = require('./phase-3-multi-word-clusters.js');

describe('parseClusters', () => {
  test('parses well-formed yaml block', () => {
    const body = `Some text
\`\`\`yaml
clusters:
  - id: naming-smell
    justification: All these variables use redundant type prefixes that could be inferred from context
    symbols:
      - {file: src/api.js, line: 10, name: userObject}
      - {file: src/api.js, line: 15, name: dataArray}
\`\`\`
More text`;

    const result = parseClusters(body);
    assert.equal(result.parseError, null);
    assert.equal(result.clusters.length, 1);
    assert.equal(result.clusters[0].id, 'naming-smell');
    assert.equal(result.clusters[0].symbols.length, 2);
    assert.equal(result.clusters[0].symbols[0].name, 'userObject');
  });

  test('returns parseError when no yaml block', () => {
    const body = 'Just some text without yaml';
    const result = parseClusters(body);
    assert.notEqual(result.parseError, null);
    assert.equal(result.clusters.length, 0);
  });

  test('returns parseError when yaml block has no clusters', () => {
    const body = '```yaml\nsome: other\n```';
    const result = parseClusters(body);
    assert.notEqual(result.parseError, null);
  });

  test('parses multiple clusters', () => {
    const body = `\`\`\`yaml
clusters:
  - id: first
    justification: These symbols share a common architectural smell pattern
    symbols:
      - {file: a.js, line: 1, name: foo}
  - id: second
    justification: Another group with different but related naming issues
    symbols:
      - {file: b.js, line: 2, name: bar}
\`\`\``;

    const result = parseClusters(body);
    assert.equal(result.parseError, null);
    assert.equal(result.clusters.length, 2);
  });
});

describe('validateClusters', () => {
  test('accepts valid cluster', () => {
    const parsed = {
      clusters: [
        {
          id: 'valid',
          justification:
            'These three symbols share a redundant type prefix pattern',
          symbols: [{ file: 'a.js', line: 1, name: 'foo' }],
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.size, 0);
  });

  test('rejects catch-all-by-PR', () => {
    const parsed = {
      clusters: [
        {
          id: 'catchall',
          justification: 'All multi-word names in this PR are verbose',
          symbols: Array(12).fill({ file: 'a.js', line: 1, name: 'x' }),
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('catchall'), true);
    assert.equal(result.reasons['catchall'], 'catch-all-by-PR');
  });

  test('rejects vague justification (too short)', () => {
    const parsed = {
      clusters: [
        {
          id: 'short',
          justification: 'Bad names',
          symbols: [{ file: 'a.js', line: 1, name: 'x' }],
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('short'), true);
  });

  test('rejects vague justification (pattern match)', () => {
    const parsed = {
      clusters: [
        {
          id: 'vague',
          justification: 'verbose naming',
          symbols: [{ file: 'a.js', line: 1, name: 'x' }],
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('vague'), true);
  });

  test('rejects empty cluster', () => {
    const parsed = {
      clusters: [
        {
          id: 'empty',
          justification:
            'This is a valid justification with enough characters here',
          symbols: [],
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('empty'), true);
    assert.equal(result.reasons['empty'], 'empty cluster');
  });

  test('rejects oversized without sentinel', () => {
    const parsed = {
      clusters: [
        {
          id: 'big',
          justification:
            'These nine symbols share a common architectural smell pattern here',
          symbols: Array(9).fill({ file: 'a.js', line: 1, name: 'x' }),
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('big'), true);
  });

  test('accepts oversized with valid single-change sentinel', () => {
    const parsed = {
      clusters: [
        {
          id: 'bigok',
          justification:
            'single change: extract these symbols into a UserService class method with proper encapsulation',
          symbols: Array(9).fill({ file: 'a.js', line: 1, name: 'x' }),
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('bigok'), false);
  });

  test('rejects trivial single-change bypass', () => {
    const parsed = {
      clusters: [
        {
          id: 'trivial',
          justification: 'single change: fix it now please',
          symbols: Array(9).fill({ file: 'a.js', line: 1, name: 'x' }),
        },
      ],
    };
    const result = validateClusters(parsed);
    assert.equal(result.rejected.has('trivial'), true);
  });
});

describe('clusterCount', () => {
  test('counts valid clusters as 1 each', () => {
    const parsed = {
      clusters: [
        {
          id: 'a',
          justification: 'ok',
          symbols: [{ file: 'a.js', line: 1, name: 'x' }],
        },
        {
          id: 'b',
          justification: 'ok',
          symbols: [
            { file: 'a.js', line: 1, name: 'y' },
            { file: 'a.js', line: 2, name: 'z' },
          ],
        },
      ],
    };
    const validated = { rejected: new Set(), reasons: {} };
    assert.equal(clusterCount(parsed, validated), 2);
  });

  test('applies per-symbol penalty for rejected clusters', () => {
    const parsed = {
      clusters: [
        {
          id: 'bad',
          justification: 'All multi-word symbols in this PR',
          symbols: Array(12).fill({ file: 'a.js', line: 1, name: 'x' }),
        },
      ],
    };
    const validated = { rejected: new Set(['bad']), reasons: {} };
    assert.equal(clusterCount(parsed, validated), 12);
  });

  test('mixed valid and rejected', () => {
    const parsed = {
      clusters: [
        {
          id: 'good',
          justification: 'ok',
          symbols: [{ file: 'a.js', line: 1, name: 'x' }],
        },
        {
          id: 'bad',
          justification: 'All multi-word in file',
          symbols: Array(5).fill({ file: 'a.js', line: 1, name: 'y' }),
        },
      ],
    };
    const validated = { rejected: new Set(['bad']), reasons: {} };
    assert.equal(clusterCount(parsed, validated), 6);
  });
});

describe('extractFlatSymbolsFromFailedParse', () => {
  test('extracts file:line patterns', () => {
    const body = 'Found issues at src/api.js:42 and lib/util.js:100';
    const result = extractFlatSymbolsFromFailedParse(body);
    assert.equal(result.includes('src/api.js:42'), true);
    assert.equal(result.includes('lib/util.js:100'), true);
  });

  test('extracts backtick symbols', () => {
    const body = 'The symbols `fooBar` and `bazQux` are verbose';
    const result = extractFlatSymbolsFromFailedParse(body);
    assert.equal(result.includes('fooBar'), true);
    assert.equal(result.includes('bazQux'), true);
  });

  test('deduplicates', () => {
    const body = '`foo` appears twice: `foo`';
    const result = extractFlatSymbolsFromFailedParse(body);
    const fooCount = result.filter((s) => s === 'foo').length;
    assert.equal(fooCount, 1);
  });
});

describe('rewriteCommentWithClusterCount', () => {
  test('appends count to body without marker', () => {
    const body = 'Review content';
    const result = rewriteCommentWithClusterCount(body, 5);
    assert.equal(result.includes('**Multi-word cluster count:** 5'), true);
    assert.equal(result.includes('<!-- vsdd-cluster-count -->'), true);
  });

  test('replaces existing count', () => {
    const body =
      'Review\n<!-- vsdd-cluster-count -->\n**Multi-word cluster count:** 3\n';
    const result = rewriteCommentWithClusterCount(body, 7);
    assert.equal(result.includes('**Multi-word cluster count:** 7'), true);
    assert.equal(result.includes('count:** 3'), false);
  });
});

describe('reproducible', () => {
  test('both under budget', () => {
    assert.equal(reproducible(3, 5, 7), true);
  });

  test('both over budget', () => {
    assert.equal(reproducible(10, 12, 7), true);
  });

  test('one under one over', () => {
    assert.equal(reproducible(5, 10, 7), false);
  });

  test('exact boundary', () => {
    assert.equal(reproducible(7, 7, 7), true);
  });

  test('one at boundary one over', () => {
    assert.equal(reproducible(7, 8, 7), false);
  });
});

describe('idempotence', () => {
  test('validateClusters is idempotent conceptually', () => {
    const parsed = {
      clusters: [
        {
          id: 'a',
          justification: 'This is a valid justification over forty chars',
          symbols: [{ file: 'a.js', line: 1, name: 'x' }],
        },
      ],
    };
    const first = validateClusters(parsed);
    const second = validateClusters(parsed);
    assert.deepEqual([...first.rejected], [...second.rejected]);
  });
});
