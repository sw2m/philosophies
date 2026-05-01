// VSDD brand-state and marker-token helpers for #129 (one-way diode marker
// + .github/ whitelist). Pure functions; no I/O. Consumed by `vsdd-brand.yml`.

'use strict';

const MARKER_TOKEN = '<!-- vsdd-red-gate-cleared -->';

function isDotGithub(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  return path.startsWith('.github/');
}

function computeBrand({ whitelist, impl, marker }) {
  return Boolean(whitelist || (impl && !marker));
}

function hasMarker(body) {
  if (typeof body !== 'string' || body.length === 0) return false;
  for (const line of body.split('\n')) {
    if (line === MARKER_TOKEN) return true;
  }
  return false;
}

module.exports = {
  MARKER_TOKEN,
  isDotGithub,
  computeBrand,
  hasMarker,
};
