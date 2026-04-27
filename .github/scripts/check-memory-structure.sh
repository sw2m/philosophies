#!/usr/bin/env bash
# Structural sanity check for MEMORY.md.
#
# Asserts the canonical VSDD doc still contains all nine top-level Roman-
# numeral section headings (### **I., ### **II., ..., ### **IX.). Protects
# against accidental section deletion in PRs that touch MEMORY.md.
set -euo pipefail

MEMORY="MEMORY.md"

if [ ! -f "$MEMORY" ]; then
  echo "FAIL: $MEMORY does not exist." >&2
  exit 1
fi

required=(I II III IV V VI VII VIII IX)
missing=()

for n in "${required[@]}"; do
  # Match a line that begins with: ### **<roman>.
  if ! grep -Eq "^### \*\*${n}\." "$MEMORY"; then
    missing+=("$n")
  fi
done

if [ "${#missing[@]}" -ne 0 ]; then
  echo "FAIL: $MEMORY is missing required section heading(s):" >&2
  for n in "${missing[@]}"; do
    echo "  - ### **${n}." >&2
  done
  exit 1
fi

echo "OK: $MEMORY contains all 9 Roman-numeral section headings."
