// Phase 2a Red-Gate suite for sw2m/philosophies#100.
//
// Tech-spec: CI exit code from verdict plus new-gap signal.
// The consensus aggregator must exit non-zero iff (a) verdict == "fail" OR
// (b) opened_count > 0 (at least one new, non-duplicate gap issue was filed).
// A duplicate-only run with verdict pass must exit 0.
//
// These tests invoke the pure function decide_exit_code(verdict, opened_count)
// in .github/scripts/consensus.py via Python subprocess.
//
// Run with: node --test tests/issue-100-exit-code.test.js

const { test, before } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'scripts',
  'consensus.py',
);

const SCRIPT_DIR = path.dirname(SCRIPT_PATH).replace(/\\/g, '/');

/**
 * Check that consensus.py exists and can be imported.
 * Returns { ok: boolean, error?: string }
 */
function checkImport() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    return { ok: false, error: 'consensus.py does not exist' };
  }
  const code = `
import sys
sys.path.insert(0, '${SCRIPT_DIR}')
from consensus import decide_exit_code
print("import_ok")
`;
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0 || !result.stdout.includes('import_ok')) {
    return {
      ok: false,
      error: `import failed: ${result.stderr || result.stdout || 'unknown error'}`,
    };
  }
  return { ok: true };
}

/**
 * Invoke decide_exit_code via Python and return { status, stdout, stderr }.
 * Throws if the module cannot be imported.
 */
function call(verdict, count) {
  const imp = checkImport();
  if (!imp.ok) {
    throw new Error(imp.error);
  }
  const code = `
import sys
sys.path.insert(0, '${SCRIPT_DIR}')
from consensus import decide_exit_code
result = decide_exit_code(${JSON.stringify(verdict)}, ${count})
print(f"returned:{result}")
sys.exit(result)
`;
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Invoke decide_exit_code via Python and check if it raises ValueError.
 * Throws if the module cannot be imported.
 */
function raises(verdict, count) {
  const imp = checkImport();
  if (!imp.ok) {
    throw new Error(imp.error);
  }
  const code = `
import sys
sys.path.insert(0, '${SCRIPT_DIR}')
from consensus import decide_exit_code
try:
    decide_exit_code(${JSON.stringify(verdict)}, ${count})
    sys.exit(0)  # no exception
except ValueError:
    sys.exit(42)  # ValueError raised
except Exception as e:
    print(f"unexpected: {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(1)  # other exception
`;
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return result.status === 42;
}

// -----------------------------------------------------------------------------
// 1. Truth table: four valid input combinations (Property 1-4 from spec).
// -----------------------------------------------------------------------------

test('exit code: verdict=pass, opened_count=0 → 0 (clean pass)', () => {
  const r = call('pass', 0);
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}`);
});

test('exit code: verdict=fail, opened_count=0 → 1 (verdict-monotonicity)', () => {
  const r = call('fail', 0);
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
});

test('exit code: verdict=pass, opened_count=5 → 1 (gap-monotonicity)', () => {
  const r = call('pass', 5);
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
});

test('exit code: verdict=fail, opened_count=5 → 1 (both conditions)', () => {
  const r = call('fail', 5);
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
});

// -----------------------------------------------------------------------------
// 2. Input validation: invalid verdict raises ValueError (Property 5).
// -----------------------------------------------------------------------------

test('input validation: verdict="" raises ValueError', () => {
  assert.ok(raises('', 0), 'empty string verdict should raise ValueError');
});

test('input validation: verdict="error" raises ValueError', () => {
  assert.ok(raises('error', 0), 'invalid verdict "error" should raise ValueError');
});

test('input validation: verdict="timeout" raises ValueError', () => {
  assert.ok(raises('timeout', 0), 'invalid verdict "timeout" should raise ValueError');
});

test('input validation: verdict="PASS" (capitalized) raises ValueError', () => {
  assert.ok(raises('PASS', 0), 'capitalized "PASS" should raise ValueError');
});

test('input validation: verdict="FAIL" (capitalized) raises ValueError', () => {
  assert.ok(raises('FAIL', 0), 'capitalized "FAIL" should raise ValueError');
});

// -----------------------------------------------------------------------------
// 3. Input validation: negative opened_count raises ValueError (Property 5).
// -----------------------------------------------------------------------------

test('input validation: opened_count=-1 raises ValueError', () => {
  assert.ok(raises('pass', -1), 'negative opened_count should raise ValueError');
});

test('input validation: opened_count=-100 raises ValueError', () => {
  assert.ok(raises('pass', -100), 'large negative opened_count should raise ValueError');
});

// -----------------------------------------------------------------------------
// 4. Idempotence: same inputs yield same outputs (Property 1).
// -----------------------------------------------------------------------------

test('idempotence: repeated calls with same inputs return same result', () => {
  const first = call('pass', 0);
  const second = call('pass', 0);
  const third = call('pass', 0);
  assert.strictEqual(first.status, second.status);
  assert.strictEqual(second.status, third.status);
  assert.strictEqual(first.status, 0);
});

// -----------------------------------------------------------------------------
// 5. Regression: function does not call sys.exit() itself (returns int).
// -----------------------------------------------------------------------------

test('regression: decide_exit_code returns int, does not call sys.exit()', () => {
  // If the function called sys.exit() internally, this wrapper would exit
  // with that code before reaching the print. We verify by checking that
  // the printed return value matches the wrapper's exit code.
  // The call() helper already uses this pattern, so we just verify the output.
  const r = call('fail', 0);
  assert.ok(
    r.stdout.includes('returned:1'),
    `function should return the exit code, not call sys.exit() directly; got stdout: ${r.stdout}`,
  );
  assert.strictEqual(r.status, 1);
});
