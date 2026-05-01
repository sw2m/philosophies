// VSDD brand-state and marker-token helpers for #129 (one-way diode marker
// + .github/ whitelist). Pure functions; no I/O. Consumed by `vsdd-brand.yml`.

'use strict';

const MARKER_TOKEN = '<!-- vsdd-red-gate-cleared -->';

function isUnderDotGithub(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  return path.startsWith('.github/');
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
  isUnderDotGithub,
  computeBrandState,
  hasMarkerToken,
};
