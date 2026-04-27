#!/usr/bin/env bash
set -euo pipefail

# Query the most recent red-gate-cleared ancestor of a commit.
#
# Usage:
#   query-red-gate.sh [SHA]
#
# If SHA is omitted, uses HEAD. Walks the commit ancestry (first-parent)
# looking for a commit with the vsdd/red-gate-cleared status. Exits 0 and
# prints the cleared SHA if found; exits 1 if not found.
#
# Requires: GH_TOKEN or GITHUB_TOKEN set, gh CLI installed.
# Uses GITHUB_REPOSITORY from the environment (set automatically in CI).

SHA="${1:-HEAD}"
SHA=$(git rev-parse "$SHA")

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

MAX_DEPTH=50
depth=0

while [ $depth -lt $MAX_DEPTH ]; do
  status=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${SHA}/status" \
    --jq '.statuses[] | select(.context == "vsdd/red-gate-cleared") | .state' \
    2>/dev/null || true)
  if [ "$status" = "success" ]; then
    echo "$SHA"
    exit 0
  fi
  PARENT=$(git rev-parse "${SHA}^" 2>/dev/null || true)
  if [ -z "$PARENT" ]; then
    break
  fi
  SHA="$PARENT"
  depth=$((depth + 1))
done

exit 1
