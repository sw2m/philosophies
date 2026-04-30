// Phase 2a Red-Gate suite for sw2m/philosophies#113.
//
// Tech-spec: Trust signal API for composite actions.
// Add `trust-github-actions-bot` input to gemini and claude actions
// with POSIX-compatible normalization to a `trust_bot` shell variable.
//
// Run with: node --test tests/issue-113-trust-signal-api.test.js

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
// 1. Input declaration exists in both actions.
// -----------------------------------------------------------------------------

test('gemini action.yml declares trust-github-actions-bot input', () => {
  // The input must be declared in the inputs section.
  assert.match(
    gemini,
    /trust-github-actions-bot:/,
    'gemini action.yml must declare trust-github-actions-bot input',
  );
});

test('claude action.yml declares trust-github-actions-bot input', () => {
  assert.match(
    claude,
    /trust-github-actions-bot:/,
    'claude action.yml must declare trust-github-actions-bot input',
  );
});

// -----------------------------------------------------------------------------
// 2. Input defaults to 'false'.
// -----------------------------------------------------------------------------

test('gemini trust-github-actions-bot input defaults to false', () => {
  // The input block must contain default: 'false' or default: "false".
  // Capture the trust-github-actions-bot block and verify default.
  const block = extractInputBlock(gemini, 'trust-github-actions-bot');
  assert.ok(block, 'trust-github-actions-bot input block not found in gemini');
  assert.match(
    block,
    /default:\s*['"]?false['"]?/,
    'gemini trust-github-actions-bot must default to false',
  );
});

test('claude trust-github-actions-bot input defaults to false', () => {
  const block = extractInputBlock(claude, 'trust-github-actions-bot');
  assert.ok(block, 'trust-github-actions-bot input block not found in claude');
  assert.match(
    block,
    /default:\s*['"]?false['"]?/,
    'claude trust-github-actions-bot must default to false',
  );
});

// -----------------------------------------------------------------------------
// 3. Input is not marked required (must be optional).
// -----------------------------------------------------------------------------

test('gemini trust-github-actions-bot input is optional', () => {
  const block = extractInputBlock(gemini, 'trust-github-actions-bot');
  assert.ok(block, 'trust-github-actions-bot input block not found in gemini');
  assert.match(
    block,
    /required:\s*false/,
    'gemini trust-github-actions-bot must be optional (required: false)',
  );
});

test('claude trust-github-actions-bot input is optional', () => {
  const block = extractInputBlock(claude, 'trust-github-actions-bot');
  assert.ok(block, 'trust-github-actions-bot input block not found in claude');
  assert.match(
    block,
    /required:\s*false/,
    'claude trust-github-actions-bot must be optional (required: false)',
  );
});

// -----------------------------------------------------------------------------
// 4. ENV mapping: INPUT_TRUST_BOT must be set from the input.
// -----------------------------------------------------------------------------

test('gemini action maps INPUT_TRUST_BOT env from the input', () => {
  // The spec requires: env: INPUT_TRUST_BOT: ${{ inputs.trust-github-actions-bot }}
  assert.match(
    gemini,
    /INPUT_TRUST_BOT:\s*\$\{\{\s*inputs\.trust-github-actions-bot\s*\}\}/,
    'gemini must map INPUT_TRUST_BOT from inputs.trust-github-actions-bot',
  );
});

test('claude action maps INPUT_TRUST_BOT env from the input', () => {
  assert.match(
    claude,
    /INPUT_TRUST_BOT:\s*\$\{\{\s*inputs\.trust-github-actions-bot\s*\}\}/,
    'claude must map INPUT_TRUST_BOT from inputs.trust-github-actions-bot',
  );
});

// -----------------------------------------------------------------------------
// 5. POSIX-compatible normalization using tr (not Bash 4+ ${var,,}).
// -----------------------------------------------------------------------------

test('gemini action uses tr for case normalization (POSIX-compatible)', () => {
  // The spec requires: tr '[:upper:]' '[:lower:]' for case conversion,
  // NOT ${var,,} which requires Bash 4+.
  assert.match(
    gemini,
    /tr\s+'\[:upper:\]'\s+'\[:lower:\]'/,
    'gemini must use tr for POSIX-compatible lowercase conversion',
  );
  // Ensure the Bash 4+ syntax is NOT used.
  assert.doesNotMatch(
    gemini,
    /\$\{INPUT_TRUST_BOT,,\}/,
    'gemini must not use Bash 4+ ${var,,} syntax',
  );
});

test('claude action uses tr for case normalization (POSIX-compatible)', () => {
  assert.match(
    claude,
    /tr\s+'\[:upper:]'\s+'\[:lower:]'/,
    'claude must use tr for POSIX-compatible lowercase conversion',
  );
  assert.doesNotMatch(
    claude,
    /\$\{INPUT_TRUST_BOT,,\}/,
    'claude must not use Bash 4+ ${var,,} syntax',
  );
});

// -----------------------------------------------------------------------------
// 6. Normalization produces trust_bot variable.
// -----------------------------------------------------------------------------

test('gemini action produces trust_bot shell variable', () => {
  // The spec requires the normalization to produce a trust_bot variable
  // set to exactly 'true' or 'false'.
  assert.match(
    gemini,
    /trust_bot=true/,
    'gemini must set trust_bot=true in the true branch',
  );
  assert.match(
    gemini,
    /trust_bot=false/,
    'gemini must set trust_bot=false in the fallback branch',
  );
});

test('claude action produces trust_bot shell variable', () => {
  assert.match(
    claude,
    /trust_bot=true/,
    'claude must set trust_bot=true in the true branch',
  );
  assert.match(
    claude,
    /trust_bot=false/,
    'claude must set trust_bot=false in the fallback branch',
  );
});

// -----------------------------------------------------------------------------
// 7. Defensive ${INPUT_TRUST_BOT:-} for set -u compatibility.
// -----------------------------------------------------------------------------

test('gemini action uses defensive ${INPUT_TRUST_BOT:-} expansion', () => {
  // The spec requires ${INPUT_TRUST_BOT:-} to avoid set -u failures.
  assert.match(
    gemini,
    /\$\{INPUT_TRUST_BOT:-\}/,
    'gemini must use ${INPUT_TRUST_BOT:-} for set -u safety',
  );
});

test('claude action uses defensive ${INPUT_TRUST_BOT:-} expansion', () => {
  assert.match(
    claude,
    /\$\{INPUT_TRUST_BOT:-\}/,
    'claude must use ${INPUT_TRUST_BOT:-} for set -u safety',
  );
});

// -----------------------------------------------------------------------------
// 8. Single-search-locatability: token appears in both action files.
// -----------------------------------------------------------------------------

test('trust-github-actions-bot token is grep-able in gemini action', () => {
  const count = (gemini.match(/trust-github-actions-bot/g) || []).length;
  // Must appear at least twice: input declaration + env mapping.
  assert.ok(
    count >= 2,
    `gemini must reference trust-github-actions-bot at least twice (found ${count})`,
  );
});

test('trust-github-actions-bot token is grep-able in claude action', () => {
  const count = (claude.match(/trust-github-actions-bot/g) || []).length;
  assert.ok(
    count >= 2,
    `claude must reference trust-github-actions-bot at least twice (found ${count})`,
  );
});

// -----------------------------------------------------------------------------
// Helper: Extract an input block from action.yml content.
// -----------------------------------------------------------------------------

function extractInputBlock(content, name) {
  // Line-based scanner: locate the line declaring `name:` at some indent,
  // then walk forward to the next line whose indent is <= the declaration
  // indent and which itself starts a new YAML key. The original regex form
  // collapsed to a single-line capture under the `m` flag because `$`
  // matched end-of-line, not end-of-input.
  const lines = content.split('\n');
  const headerRe = new RegExp(`^([ \\t]*)${name}:`);
  let startIdx = -1;
  let indentLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (m) {
      startIdx = i;
      indentLen = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return null;
  const keyRe = /^([ \t]*)[A-Za-z_][A-Za-z0-9_-]*:/;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const m = lines[i].match(keyRe);
    if (m && m[1].length <= indentLen) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}
