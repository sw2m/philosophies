// Phase 2a Red-Gate suite for sw2m/philosophies#114.
//
// Tech-spec: Safe-context predicate per event type.
// The predicates determine when callers may safely set
// trust-github-actions-bot: 'true' based on GitHub event type.
// Predicates are documented at .github/SAFE-CONTEXT-PREDICATES.md.
//
// Run with: node --test tests/issue-114-safe-context-predicates.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PREDICATES_PATH = path.join(
  __dirname,
  '..',
  '.github',
  'SAFE-CONTEXT-PREDICATES.md',
);

const MEMORY_PATH = path.join(__dirname, '..', 'MEMORY.md');

// -----------------------------------------------------------------------------
// 1. File existence.
// -----------------------------------------------------------------------------

test('.github/SAFE-CONTEXT-PREDICATES.md must exist', () => {
  assert.ok(
    fs.existsSync(PREDICATES_PATH),
    '.github/SAFE-CONTEXT-PREDICATES.md does not exist — predicate documentation is missing',
  );
});

// -----------------------------------------------------------------------------
// 2. Required event types are documented.
// -----------------------------------------------------------------------------

const EVENT_TYPES = [
  'pull_request',
  'pull_request_target',
  'push',
  'workflow_dispatch',
  'repository_dispatch',
  'schedule',
  'workflow_run',
  'issues',
  'issue_comment',
];

test('all required event types are documented', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  for (const event of EVENT_TYPES) {
    assert.match(
      content,
      new RegExp(`###\\s+\`${event}\``),
      `event type ${event} is not documented with a ### heading`,
    );
  }
});

// -----------------------------------------------------------------------------
// 3. Security-critical predicates: pull_request_target must be 'false'.
// -----------------------------------------------------------------------------

test('pull_request_target predicate must be explicitly false', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'pull_request_target');
  assert.ok(section, 'pull_request_target section not found');
  assert.match(
    section,
    /'false'/,
    "pull_request_target predicate must contain literal 'false' — trust is NEVER safe",
  );
  assert.doesNotMatch(
    section,
    /\$\{\{\s*github\./,
    'pull_request_target must not contain any conditional expression — must be unconditional false',
  );
});

// -----------------------------------------------------------------------------
// 4. Security-critical predicates: issue_comment must be 'false'.
// -----------------------------------------------------------------------------

test('issue_comment predicate must be explicitly false', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'issue_comment');
  assert.ok(section, 'issue_comment section not found');
  assert.match(
    section,
    /'false'/,
    "issue_comment predicate must contain literal 'false' — trust is unsafe",
  );
  assert.doesNotMatch(
    section,
    /\$\{\{\s*github\./,
    'issue_comment must not contain any conditional expression — must be unconditional false',
  );
});

// -----------------------------------------------------------------------------
// 5. pull_request predicate uses head.repo.full_name check.
// -----------------------------------------------------------------------------

test('pull_request predicate checks head.repo.full_name == github.repository', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'pull_request');
  assert.ok(section, 'pull_request section not found');
  assert.match(
    section,
    /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    'pull_request predicate must check head.repo.full_name == github.repository',
  );
});

// -----------------------------------------------------------------------------
// 6. workflow_run predicate uses head_repository.full_name check.
// -----------------------------------------------------------------------------

test('workflow_run predicate checks head_repository.full_name == github.repository', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'workflow_run');
  assert.ok(section, 'workflow_run section not found');
  assert.match(
    section,
    /github\.event\.workflow_run\.head_repository\.full_name\s*==\s*github\.repository/,
    'workflow_run predicate must check head_repository.full_name == github.repository',
  );
});

// -----------------------------------------------------------------------------
// 7. repository_dispatch uses client_payload.trusted check.
// -----------------------------------------------------------------------------

test('repository_dispatch predicate checks client_payload.trusted', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'repository_dispatch');
  assert.ok(section, 'repository_dispatch section not found');
  assert.match(
    section,
    /github\.event\.client_payload\.trusted\s*==\s*true/,
    'repository_dispatch predicate must check client_payload.trusted == true',
  );
});

// -----------------------------------------------------------------------------
// 8. Default-deny fallback for unrecognized event types.
// -----------------------------------------------------------------------------

test('default-deny fallback is documented for unrecognized event types', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  assert.match(
    content,
    /other|unrecognized|default/i,
    'must document default-deny behavior for unrecognized event types',
  );
  assert.match(
    content,
    /'false'/,
    "default fallback must specify 'false' for fail-closed behavior",
  );
});

// -----------------------------------------------------------------------------
// 9. MEMORY.md references the predicates file.
// -----------------------------------------------------------------------------

test('MEMORY.md CI/CD section references SAFE-CONTEXT-PREDICATES.md', () => {
  const memory = fs.readFileSync(MEMORY_PATH, 'utf8');
  assert.match(
    memory,
    /SAFE-CONTEXT-PREDICATES\.md/,
    'MEMORY.md must reference SAFE-CONTEXT-PREDICATES.md',
  );
});

// -----------------------------------------------------------------------------
// 10. Each predicate has a rationale paragraph.
// -----------------------------------------------------------------------------

test('each event type has a rationale paragraph', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  for (const event of EVENT_TYPES) {
    const section = extractSection(content, event);
    assert.ok(section, `${event} section not found`);
    assert.match(
      section,
      /rationale/i,
      `${event} section must include a rationale`,
    );
  }
});

// -----------------------------------------------------------------------------
// 11. Dependabot edge case is documented for pull_request.
// -----------------------------------------------------------------------------

test('pull_request section documents Dependabot edge case', () => {
  if (!fs.existsSync(PREDICATES_PATH)) {
    assert.fail('predicates file does not exist');
  }
  const content = fs.readFileSync(PREDICATES_PATH, 'utf8');
  const section = extractSection(content, 'pull_request');
  assert.ok(section, 'pull_request section not found');
  assert.match(
    section,
    /[Dd]ependabot/,
    'pull_request section must document the Dependabot edge case',
  );
});

// -----------------------------------------------------------------------------
// Helper: extract section from ### `event_type` to next ### or end.
// -----------------------------------------------------------------------------

function extractSection(content, event) {
  const pattern = new RegExp(
    `###\\s+\`${event}\`([\\s\\S]*?)(?=###\\s+\`|$)`,
    'i',
  );
  const match = content.match(pattern);
  return match ? match[1] : null;
}
