#!/usr/bin/env bash
# Test-code classifier for commit file changes.
#
# §VIII (4-Result Rule) — the Red/Green gates require distinguishing
# test commits from implementation commits to enforce "tests first"
# discipline.
#
# Usage:
#   classify-changes.sh <commit-sha> [--patterns <glob-patterns>]
#   classify-changes.sh --pr <base>...<head> [--patterns <glob-patterns>]
#
# Outputs (to stdout, one per line):
#   tests-only=true|false
#   changed-files=<count>
#   test-files=<count>
#
# Exit codes:
#   0 — classification succeeded
#   1 — invalid arguments or git error
#
# Pattern configuration:
#   - Pass --patterns with a newline-separated list of glob patterns
#   - Or set TEST_PATH_PATTERNS env var (newline-separated globs)
#   - Default patterns cover common conventions:
#       test/*  tests/*  __tests__/*
#       *_test.go  *_test.py  *_test.rs
#       *.test.js  *.test.ts  *.test.jsx  *.test.tsx
#       *.spec.js  *.spec.ts  *.spec.jsx  *.spec.tsx
#       test_*.py  *_spec.rb
set -euo pipefail

DEFAULT_PATTERNS='test/*
tests/*
__tests__/*
*_test.go
*_test.py
*_test.rs
*.test.js
*.test.ts
*.test.jsx
*.test.tsx
*.spec.js
*.spec.ts
*.spec.jsx
*.spec.tsx
test_*.py
*_spec.rb
*.test.mjs
*.test.cjs
*.spec.mjs
*.spec.cjs'

usage() {
  echo "Usage: $0 <commit-sha> [--patterns <glob-patterns>]"
  echo "       $0 --pr <base>...<head> [--patterns <glob-patterns>]"
  exit 1
}

# Parse arguments
MODE="commit"
TARGET=""
PATTERNS="${TEST_PATH_PATTERNS:-$DEFAULT_PATTERNS}"

while [ $# -gt 0 ]; do
  case "$1" in
    --pr)
      MODE="pr"
      TARGET="$2"
      shift 2
      ;;
    --patterns)
      PATTERNS="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      if [ -z "$TARGET" ]; then
        TARGET="$1"
      else
        echo "error: unexpected argument: $1" >&2
        usage
      fi
      shift
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "error: missing commit SHA or PR range" >&2
  usage
fi

# Get list of changed files
if [ "$MODE" = "pr" ]; then
  # PR mode: diff between base and head
  files=$(git diff --name-only "$TARGET" 2>/dev/null) || {
    echo "error: git diff failed for range $TARGET" >&2
    exit 1
  }
else
  # Commit mode: files changed in that specific commit
  files=$(git diff-tree --no-commit-id --name-only -r "$TARGET" 2>/dev/null) || {
    echo "error: git diff-tree failed for commit $TARGET" >&2
    exit 1
  }
fi

# Count total files
total=0
test_count=0

# Check each file against patterns
while IFS= read -r file; do
  [ -z "$file" ] && continue
  total=$((total + 1))

  matched=false
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    # Use bash pattern matching — pattern can match anywhere in path
    # shellcheck disable=SC2254
    case "$file" in
      $pattern)
        matched=true
        break
        ;;
    esac
    # Also check if the file basename matches (for *_test.go style patterns)
    base=$(basename "$file")
    # shellcheck disable=SC2254
    case "$base" in
      $pattern)
        matched=true
        break
        ;;
    esac
  done <<< "$PATTERNS"

  if [ "$matched" = true ]; then
    test_count=$((test_count + 1))
  fi
done <<< "$files"

# Determine result
if [ "$total" -eq 0 ]; then
  # No files changed — treat as tests-only (vacuously true)
  result="true"
elif [ "$test_count" -eq "$total" ]; then
  result="true"
else
  result="false"
fi

echo "tests-only=$result"
echo "changed-files=$total"
echo "test-files=$test_count"
