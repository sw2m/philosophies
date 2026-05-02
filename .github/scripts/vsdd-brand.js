// VSDD brand-state and marker-token helpers for #129 + the broader
// non-impl whitelist. Pure functions; no I/O. Consumed by
// `vsdd-brand.yml` and `non-test-blocker.yml`.

'use strict';

const MARKER_TOKEN = '<!-- vsdd-red-gate-cleared -->';

// Top-level repo-metadata files that are not source code; touching
// them shouldn't invoke TDD discipline. Anchored to the repo root.
const ROOT_METADATA_FILES = new Set([
  '.gitignore',
  '.gitattributes',
  'LICENSE',
  'CODEOWNERS',
]);

// Predicate: is this changed-file path exempt from VSDD test discipline?
//
// Returns true iff one of:
//   - path is under `.github/` (CI infrastructure; verified by firing
//     workflows in production).
//   - path ends in `.md` (markdown documentation; not unit-testable).
//   - path is one of the recognized root-level repo-metadata files
//     (`.gitignore`, `LICENSE`, `CODEOWNERS`, etc.).
function isWhitelistPath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('.github/')) return true;
  if (path.endsWith('.md')) return true;
  if (ROOT_METADATA_FILES.has(path)) return true;
  if (/^LICENSE(\..+)?$/.test(path)) return true;
  return false;
}

function computeBrandState({ whitelist, impl, marker }) {
  return Boolean(whitelist || (impl && !marker));
}

function hasMarkerToken(body) {
  if (typeof body !== 'string' || body.length === 0) return false;
  // Tolerate CRLF: split on \n, trim trailing \r per line before
  // strict-equal-to-token comparison. The token itself contains no
  // whitespace, so trim() is safe.
  for (const line of body.split('\n')) {
    if (line.trim() === MARKER_TOKEN) return true;
  }
  return false;
}

module.exports = {
  MARKER_TOKEN,
  isWhitelistPath,
  computeBrandState,
  hasMarkerToken,
};
