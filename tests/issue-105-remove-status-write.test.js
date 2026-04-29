// Phase 2a Red-Gate suite for sw2m/philosophies#105.
//
// Tech-spec: Remove commit-status write from promote-tech-to-pr action.
// The status-write at lines 342-350 causes 403s (no statuses:write perm)
// and is redundant — the canonical marker is the PR comment from
// red-conditions-gate.yml. These tests verify the status-write is gone.
//
// Run with: node --test tests/issue-105-remove-status-write.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ACTION_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'actions',
  'promote-tech-to-pr',
  'action.yml',
);

// Read the action file once for all tests.
const action = fs.readFileSync(ACTION_PATH, 'utf8');

// -----------------------------------------------------------------------------
// 1. No gh api statuses call.
// -----------------------------------------------------------------------------

test('action.yml must not contain gh api repos/.../statuses/ call', () => {
  // The offending pattern writes a commit status via:
  //   gh api "repos/${GITHUB_REPOSITORY}/statuses/${CLEARED_SHA}" ...
  // This must be removed entirely.
  const pattern = /gh\s+api\s+[^\n]*statuses\//;
  assert.doesNotMatch(
    action,
    pattern,
    'action.yml still contains a gh api statuses/ call — the status-write has not been removed',
  );
});

// -----------------------------------------------------------------------------
// 2. No vsdd/* commit-status context.
// -----------------------------------------------------------------------------

test('action.yml must not write a commit status with vsdd/* context', () => {
  // The status-write uses context=vsdd/red-gate-cleared. After removal,
  // no line should pair "status" (case-insensitive) with "vsdd/" anywhere
  // in a context that looks like it's creating a status.
  //
  // We check for the specific context string that was used.
  const pattern = /vsdd\/red-gate-cleared/;
  assert.doesNotMatch(
    action,
    pattern,
    'action.yml still references vsdd/red-gate-cleared context — the status-write has not been removed',
  );
});

// -----------------------------------------------------------------------------
// 3. No -f state= flag in gh api calls (status-write signature).
// -----------------------------------------------------------------------------

test('action.yml must not contain gh api call with -f state= (status signature)', () => {
  // The commit-status API call uses `-f state=success`. After removal,
  // there should be no gh api call with -f state= in the action.
  // This catches variations in how the statuses endpoint might be called.
  const pattern = /gh\s+api\s+[^\n]*-f\s+state=/;
  assert.doesNotMatch(
    action,
    pattern,
    'action.yml contains a gh api call with -f state= — likely a status-write that should be removed',
  );
});
