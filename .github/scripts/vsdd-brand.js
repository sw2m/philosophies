// VSDD brand-state and marker-token helpers for #129 (one-way diode marker
// + .github/ whitelist). Pure functions; no I/O. Consumed by `vsdd-brand.yml`
// and tested in `tests/issue-129-vsdd-brand.test.js`.

'use strict';

const MARKER_TOKEN = '<!-- vsdd-red-gate-cleared -->';

function isUnderDotGithub(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  return filePath.startsWith('.github/');
}

function computeBrandState({ whitelist, hasImpl, markerPresent }) {
  return Boolean(whitelist || (hasImpl && !markerPresent));
}

function hasMarkerToken(body) {
  if (typeof body !== 'string' || body.length === 0) return false;
  for (const line of body.split('\n')) {
    if (line === MARKER_TOKEN) return true;
  }
  return false;
}

module.exports = {
  MARKER_TOKEN,
  isUnderDotGithub,
  computeBrandState,
  hasMarkerToken,
};
