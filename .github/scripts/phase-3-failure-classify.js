// Phase 3 operational failure classifier.
// Classifies agent step outcomes into {success, op-failure} with reasons.
//
// Pure core: the classification logic is a deterministic stdin-pattern →
// output-classification mapping. File I/O is wrapped at the API boundary.
//
// Usage:
//   const { classify, classifySync } = require('./phase-3-failure-classify.js');
//   const result = classifySync({
//     exitCode: 'failure',   // GitHub Actions step outcome
//     stdoutFile: 'out.txt',
//     stderrFile: 'err.txt',
//   });
//   // result.classification ∈ {success, op-failure}
//   // result.reason ∈ {null, timeout, api-error, crash, malformed, schema-violation}

const fs = require('fs');

const API_ERROR_PATTERN = /HTTP 5\d{2}|rate.?limit|x-ratelimit-remaining:\s*0|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|upstream connect error/i;

const TIMEOUT_EXIT_CODES = new Set([124, 137]);

function classifyPure({ exitCode, stdout, stderr, schema }) {
  const code = typeof exitCode === 'string' ? exitCode : String(exitCode);

  if (code === 'success' || code === '0') {
    const parsed = parseOutput(stdout);
    if (!parsed.valid) {
      return { classification: 'op-failure', reason: 'malformed' };
    }
    if (parsed.verdict === 'pending') {
      return { classification: 'op-failure', reason: 'malformed' };
    }
    if (schema && !validateSchema(parsed, schema)) {
      return { classification: 'op-failure', reason: 'schema-violation' };
    }
    return { classification: 'success', reason: null, parsed };
  }

  const numeric = parseInt(code, 10);
  if (TIMEOUT_EXIT_CODES.has(numeric)) {
    return { classification: 'op-failure', reason: 'timeout' };
  }

  if (API_ERROR_PATTERN.test(stderr || '')) {
    return { classification: 'op-failure', reason: 'api-error' };
  }

  return { classification: 'op-failure', reason: 'crash' };
}

function parseOutput(stdout) {
  if (!stdout || typeof stdout !== 'string') {
    return { valid: false };
  }

  const fm = stdout.match(/^\s*---\s*\n([\s\S]*?)\n---/);
  if (!fm) {
    const bare = stdout.match(/^\s*\**\s*verdict\s*\**\s*[:=]\s*\**\s*(pass|fail)\b/im);
    if (!bare) {
      return { valid: false };
    }
    return { valid: true, verdict: bare[1].toLowerCase(), frontmatter: {} };
  }

  const lines = fm[1].split('\n');
  const frontmatter = {};
  for (const line of lines) {
    const kv = line.match(/^\s*([^:]+)\s*:\s*(.*)$/);
    if (kv) {
      frontmatter[kv[1].trim().toLowerCase()] = kv[2].trim();
    }
  }

  const v = frontmatter.verdict;
  if (!v || (v !== 'pass' && v !== 'fail' && v !== 'pending')) {
    return { valid: false };
  }

  return { valid: true, verdict: v, frontmatter };
}

function validateSchema(parsed, schema) {
  const fm = parsed.frontmatter || {};
  const required = schema.required || ['verdict', 'category', 'commit-sha'];
  for (const key of required) {
    if (!fm[key]) {
      return false;
    }
  }
  if (schema.validator && typeof schema.validator === 'function') {
    return schema.validator(parsed);
  }
  return true;
}

function classifySync({ exitCode, stdoutFile, stderrFile, schema }) {
  let stdout = '';
  let stderr = '';

  if (stdoutFile) {
    try {
      stdout = fs.readFileSync(stdoutFile, 'utf8');
    } catch {
      stdout = '';
    }
  }

  if (stderrFile) {
    try {
      stderr = fs.readFileSync(stderrFile, 'utf8');
    } catch {
      stderr = '';
    }
  }

  return classifyPure({ exitCode, stdout, stderr, schema });
}

function classify(opts) {
  return classifySync(opts);
}

function formatPending({ category, reviewer, reason, sha, timestamp }) {
  const ts = timestamp || new Date().toISOString();
  return `<!-- vsdd-phase-3
category: ${category}
reviewer: ${reviewer}
verdict: pending
reason: ${reason}
commit-sha: ${sha}
round: pending
retries-exhausted: false
-->

**Phase 3 — ${category}: pending (operational failure, ${reason}).**
Last attempt: ${ts}. Re-run via \`gh run rerun --failed <run-id>\` or push a new commit.`;
}

module.exports = {
  classify,
  classifySync,
  classifyPure,
  parseOutput,
  validateSchema,
  formatPending,
  API_ERROR_PATTERN,
  TIMEOUT_EXIT_CODES,
};
