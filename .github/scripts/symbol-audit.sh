#!/usr/bin/env bash
# Advisory §IX (Multi-Word Symbol Analysis) static pre-check.
#
# Greps a unified diff for newly-introduced identifiers that match
# camelCase or snake_case patterns. Posts the matches as a PR comment
# under <details> so a human reviewer can scan them quickly.
#
# Per MEMORY.md §IX exceptions:
#   - PascalCase classes/types are exempt (not flagged at all here).
#   - SCREAMING_SNAKE constants are exempt (not flagged at all here).
#   - Common serde-leak field names (c_type, data_type, etc.) are
#     soft-filtered into a separate "likely serde leaks" bucket.
#   - Hunks whose file path lives under a third-party tree
#     (node_modules/, vendor/, third_party/, third-party/) are
#     soft-filtered into a separate "likely external" bucket.
#
# This script is **advisory only** and ALWAYS exits 0. The AI reviewers
# (gemini-review, claude-review) remain the source of truth for §IX
# judgment calls; this is a deterministic pre-check that gives the
# reviewer a head-start, not a gate.
set -euo pipefail

DIFF_FILE="${1:-pr.diff}"
OUT_FILE="${2:-symbol-audit.md}"

if [ ! -f "$DIFF_FILE" ]; then
  echo "symbol-audit: $DIFF_FILE not found; emitting empty report." >&2
  printf '_No diff to audit (\`%s\` missing)._\n' "$DIFF_FILE" > "$OUT_FILE"
  exit 0
fi

# Allowlist of known serde-leak field names. Extracted from MEMORY.md §IX
# (the `c_type` example) plus common idiomatic siblings. Keep this short
# — adding too many entries silently weakens the check.
SERDE_ALLOW_RE='^(c_type|data_type|content_type|mime_type|created_at|updated_at|deleted_at|user_id|api_key|access_token|refresh_token)$'

# Third-party path markers. A hunk under any of these is treated as
# "likely external" rather than a §IX violation.
EXTERNAL_PATH_RE='(^|/)(node_modules|vendor|third_party|third-party|venv|[.]venv|dist|build)(/|$)'

# Walk the diff, tracking the current `+++ b/<path>` so we can attribute
# each added line to a file. Only added lines (`^+` but not `^+++`) are
# scanned. We emit one TSV record per identifier match:
#   <path>\t<bucket>\t<symbol>
# where bucket ∈ {primary, serde, external}.
records="$(mktemp)"
trap 'rm -f "$records"' EXIT

awk -v serde_re="$SERDE_ALLOW_RE" -v ext_re="$EXTERNAL_PATH_RE" '
  /^\+\+\+ / {
    # Strip leading "+++ " and an optional "b/" prefix.
    path = substr($0, 5)
    sub(/^b\//, "", path)
    next
  }
  /^--- / { next }
  /^\+/ {
    # Only added lines (skip the "+++" header, already handled).
    line = substr($0, 2)

    # Determine bucket for this file.
    bucket = "primary"
    if (path ~ ext_re) bucket = "external"

    # Scan for camelCase: starts lowercase, has at least one uppercase
    # letter mid-symbol. Excludes PascalCase (would start uppercase).
    rest = line
    while (match(rest, /[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*/)) {
      sym = substr(rest, RSTART, RLENGTH)
      # Reject if the previous char is a word char (means we matched
      # the tail of a longer identifier, e.g. PascalCase).
      prev_idx = RSTART - 1
      prev = (prev_idx >= 1) ? substr(rest, prev_idx, 1) : ""
      if (prev !~ /[A-Za-z0-9_]/) {
        print path "\t" bucket "\tcamelCase\t" sym
      }
      rest = substr(rest, RSTART + RLENGTH)
    }

    # Scan for snake_case: lowercase start, at least one underscore,
    # all-lowercase/digits otherwise. SCREAMING_SNAKE is excluded by
    # the leading [a-z] anchor.
    rest = line
    while (match(rest, /[a-z][a-z0-9]*_[a-z0-9_]+/)) {
      sym = substr(rest, RSTART, RLENGTH)
      prev_idx = RSTART - 1
      prev = (prev_idx >= 1) ? substr(rest, prev_idx, 1) : ""
      if (prev !~ /[A-Za-z0-9_]/) {
        sub_bucket = bucket
        if (sym ~ serde_re) sub_bucket = "serde"
        print path "\t" sub_bucket "\tsnake_case\t" sym
      }
      rest = substr(rest, RSTART + RLENGTH)
    }
  }
' "$DIFF_FILE" | sort -u > "$records"

primary_count=$(awk -F'\t' '$2=="primary"' "$records" | wc -l)
serde_count=$(awk -F'\t' '$2=="serde"' "$records" | wc -l)
external_count=$(awk -F'\t' '$2=="external"' "$records" | wc -l)
total=$((primary_count + serde_count + external_count))

{
  printf '**VSDD §IX symbol-audit (advisory)** — deterministic pre-check that complements the Gemini/Claude adversarial reviews.\n\n'
  printf 'Found %d candidate multi-word symbol(s): %d primary, %d likely serde-leak (allowlisted), %d external-path (allowlisted).\n\n' \
    "$total" "$primary_count" "$serde_count" "$external_count"

  if [ "$primary_count" -eq 0 ] && [ "$serde_count" -eq 0 ] && [ "$external_count" -eq 0 ]; then
    printf '_No candidate multi-word symbols found in added lines._\n'
  fi

  if [ "$primary_count" -gt 0 ]; then
    printf '<details><summary>Primary candidates (%d) — review against §IX</summary>\n\n' "$primary_count"
    printf '| File | Kind | Symbol |\n'
    printf '| --- | --- | --- |\n'
    awk -F'\t' '$2=="primary" {printf "| `%s` | %s | `%s` |\n", $1, $3, $4}' "$records"
    printf '\n</details>\n\n'
  fi

  if [ "$serde_count" -gt 0 ]; then
    printf '<details><summary>Likely serde-leak (%d) — §IX serde exception</summary>\n\n' "$serde_count"
    printf '| File | Kind | Symbol |\n'
    printf '| --- | --- | --- |\n'
    awk -F'\t' '$2=="serde" {printf "| `%s` | %s | `%s` |\n", $1, $3, $4}' "$records"
    printf '\n</details>\n\n'
  fi

  if [ "$external_count" -gt 0 ]; then
    printf '<details><summary>Third-party path (%d) — §IX external exception</summary>\n\n' "$external_count"
    printf '| File | Kind | Symbol |\n'
    printf '| --- | --- | --- |\n'
    awk -F'\t' '$2=="external" {printf "| `%s` | %s | `%s` |\n", $1, $3, $4}' "$records"
    printf '\n</details>\n\n'
  fi

  printf '\n_Advisory only — does not gate merge. The Builder/Adversary still applies §IX judgment per MEMORY.md._\n'
} > "$OUT_FILE"

echo "symbol-audit: wrote $OUT_FILE (total=$total primary=$primary_count serde=$serde_count external=$external_count)"
exit 0
