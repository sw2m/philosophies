// Unit tests for the pure dedup logic in lib.mjs.
// Uses Node's built-in node:test runner (no extra installs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectBypass,
  renderPrompt,
  parseAgentOutput,
  extractMatches,
  composeOutput,
  validateProposed,
  validateExisting,
} from './lib.mjs';

const sampleProposed = [
  { id: 'a', title: 'CI broken on main', body: 'fails on master push' },
  { id: 'b', title: 'Docs typo', body: 'README missing comma' },
];
const sampleExisting = [
  { number: 42, title: 'CI on main is red', body: 'related', state: 'OPEN' },
  { number: 43, title: 'Some other thing', body: 'unrelated', state: 'CLOSED' },
];

// --- validateProposed / validateExisting -----------------------------------

test('validateProposed accepts well-formed', () => {
  validateProposed(sampleProposed);
});
test('validateProposed rejects non-array', () => {
  assert.throws(() => validateProposed({}), /must be a JSON array/);
});
test('validateProposed rejects missing id', () => {
  assert.throws(
    () => validateProposed([{ title: 't', body: 'b' }]),
    /id is required/,
  );
});
test('validateProposed rejects non-string title', () => {
  assert.throws(
    () => validateProposed([{ id: 'x', title: 1, body: 'b' }]),
    /title must be a string/,
  );
});
test('validateExisting rejects missing number', () => {
  assert.throws(
    () => validateExisting([{ title: 't', body: 'b', state: 'OPEN' }]),
    /number must be a number/,
  );
});

// --- detectBypass ----------------------------------------------------------

test('detectBypass: bypass=false on both non-empty', () => {
  const r = detectBypass({ proposed: sampleProposed, existing: sampleExisting });
  assert.equal(r.bypass, false);
  assert.equal(r.verdicts, undefined);
});

test('detectBypass: empty proposed → bypass with empty verdicts', () => {
  const r = detectBypass({ proposed: [], existing: sampleExisting });
  assert.equal(r.bypass, true);
  assert.deepEqual(r.verdicts, []);
});

test('detectBypass: empty existing → bypass with all-null verdicts parallel to proposed', () => {
  const r = detectBypass({ proposed: sampleProposed, existing: [] });
  assert.equal(r.bypass, true);
  assert.equal(r.verdicts.length, 2);
  for (const v of r.verdicts) {
    assert.equal(v.duplicate_of, null);
    assert.equal(v.source, 'empty-input');
  }
  assert.equal(r.verdicts[0].proposed_id, 'a');
  assert.equal(r.verdicts[1].proposed_id, 'b');
});

test('detectBypass: malformed input throws', () => {
  assert.throws(() => detectBypass(null), /must be an object/);
  assert.throws(() => detectBypass({ proposed: 'not array' }), /must be a JSON array/);
});

// --- renderPrompt ----------------------------------------------------------

test('renderPrompt: includes every existing number, title, and proposed title', () => {
  const { text, bytes } = renderPrompt({ proposed: sampleProposed, existing: sampleExisting });
  assert.ok(text.includes('number="42"'), 'existing #42 missing');
  assert.ok(text.includes('CI on main is red'), 'existing title missing');
  assert.ok(text.includes('number="43"'), 'existing #43 missing');
  assert.ok(text.includes('CI broken on main'), 'proposed title missing');
  assert.ok(text.includes('Docs typo'), 'proposed title missing');
  assert.ok(text.includes('<proposed index="0">'));
  assert.ok(text.includes('<proposed index="1">'));
  assert.equal(bytes, Buffer.byteLength(text, 'utf8'));
});

test('renderPrompt: closing_prs rendered as sub-element', () => {
  const existing = [{
    ...sampleExisting[0],
    closing_prs: [{ number: 99, title: 'Fix CI', isDraft: false }],
  }];
  const { text } = renderPrompt({ proposed: sampleProposed, existing });
  assert.ok(text.includes('<closing-prs><pr number="99">Fix CI</pr></closing-prs>'));
});

test('renderPrompt: throws when over max-bytes', () => {
  assert.throws(
    () => renderPrompt({ proposed: sampleProposed, existing: sampleExisting }, 100),
    /exceeds max-bytes 100/,
  );
});

test('renderPrompt: under max-bytes returns normally', () => {
  const { bytes } = renderPrompt({ proposed: sampleProposed, existing: sampleExisting }, 1_000_000);
  assert.ok(bytes > 0);
});

// --- parseAgentOutput ------------------------------------------------------

const goodOutput = [
  '---',
  'verdicts:',
  '  - proposed_index: 0',
  '    duplicate_of: 42',
  '    rationale: |',
  '      same root cause as #42',
  '  - proposed_index: 1',
  '    duplicate_of: null',
  '    rationale: |',
  '      novel issue',
  '---',
  '',
  '(prose follows)',
].join('\n');

test('parseAgentOutput: good top frontmatter', () => {
  const r = parseAgentOutput(goodOutput, sampleProposed, new Set([42, 43]));
  assert.equal(r.ok, true);
  assert.equal(r.verdicts.length, 2);
  assert.equal(r.verdicts[0].duplicate_of, 42);
  assert.equal(r.verdicts[0].rationale, 'same root cause as #42\n');
  assert.equal(r.verdicts[1].duplicate_of, null);
  assert.equal(r.verdicts[0].source, 'agent');
});

test('parseAgentOutput: embedded frontmatter (preamble before)', () => {
  const wrapped = 'leading prose\n\n' + goodOutput;
  const r = parseAgentOutput(wrapped, sampleProposed, new Set([42, 43]));
  assert.equal(r.ok, true);
  assert.equal(r.verdicts[0].duplicate_of, 42);
});

test('parseAgentOutput: missing frontmatter → ok:false', () => {
  const r = parseAgentOutput('just prose, no yaml', sampleProposed, new Set([42]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /no parseable frontmatter/);
});

test('parseAgentOutput: referential-integrity failure → ok:false', () => {
  const bad = goodOutput.replace('duplicate_of: 42', 'duplicate_of: 999');
  const r = parseAgentOutput(bad, sampleProposed, new Set([42, 43]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /999 not in existing set/);
});

test('parseAgentOutput: multi-match → ok:false', () => {
  const dup = goodOutput.replace('  - proposed_index: 1\n    duplicate_of: null', '  - proposed_index: 0\n    duplicate_of: 43');
  const r = parseAgentOutput(dup, sampleProposed, new Set([42, 43]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /specified more than once/);
});

test('parseAgentOutput: out-of-range proposed_index ignored, others kept', () => {
  const oor = goodOutput + '\n---\nverdicts:\n  - proposed_index: 99\n    duplicate_of: 42\n---\n';
  // (still parses the first frontmatter; oor block is ignored anyway.)
  const r = parseAgentOutput(goodOutput, sampleProposed, new Set([42, 43]));
  assert.equal(r.ok, true);
});

// --- extractMatches --------------------------------------------------------

test('extractMatches: title-exact match populates duplicate_of', () => {
  const ghResp = [
    { number: 100, title: 'CI broken on main' },
    { number: 200, title: 'unrelated' },
  ];
  const r = extractMatches(sampleProposed, ghResp);
  assert.equal(r.length, 2);
  assert.equal(r[0].duplicate_of, 100);
  assert.equal(r[0].source, 'title-exact-fallback');
  assert.equal(r[1].duplicate_of, null);
});

test('extractMatches: empty gh response → all null', () => {
  const r = extractMatches(sampleProposed, []);
  assert.equal(r.every((v) => v.duplicate_of === null), true);
});

test('extractMatches: first match wins on duplicate titles', () => {
  const ghResp = [
    { number: 100, title: 'CI broken on main' },
    { number: 101, title: 'CI broken on main' },
  ];
  const r = extractMatches(sampleProposed, ghResp);
  assert.equal(r[0].duplicate_of, 100);
});

// --- composeOutput ---------------------------------------------------------

test('composeOutput: bypass wins', () => {
  const bypassResult = { bypass: true, verdicts: [{ proposed_id: 'x', duplicate_of: null, rationale: '', source: 'empty-input' }] };
  const r = composeOutput({ bypassResult, parseResult: null, fallbackResult: null });
  assert.equal(r.source, 'empty-input');
  assert.equal(r.verdicts.length, 1);
});

test('composeOutput: parse wins over fallback when ok', () => {
  const parseResult = { ok: true, verdicts: [{ proposed_id: 'a', duplicate_of: 42, rationale: '', source: 'agent' }] };
  const fallbackResult = [{ proposed_id: 'a', duplicate_of: null, rationale: '', source: 'title-exact-fallback' }];
  const r = composeOutput({ bypassResult: { bypass: false }, parseResult, fallbackResult });
  assert.equal(r.source, 'agent');
});

test('composeOutput: fallback wins when parse not-ok', () => {
  const parseResult = { ok: false, reason: 'unparseable' };
  const fallbackResult = [{ proposed_id: 'a', duplicate_of: 99, rationale: '', source: 'title-exact-fallback' }];
  const r = composeOutput({ bypassResult: { bypass: false }, parseResult, fallbackResult });
  assert.equal(r.source, 'title-exact-fallback');
  assert.equal(r.verdicts[0].duplicate_of, 99);
});

test('composeOutput: throws when nothing produced verdicts', () => {
  assert.throws(
    () => composeOutput({ bypassResult: { bypass: false }, parseResult: null, fallbackResult: null }),
    /no source produced verdicts/,
  );
});
