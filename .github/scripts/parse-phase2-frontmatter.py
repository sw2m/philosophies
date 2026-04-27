#!/usr/bin/env python3
"""Parse Phase 2 agent output frontmatter (promote-tech-to-pr).

Reads the Phase 2 output file from `sys.argv[1]`, extracts the YAML
frontmatter block at the END of the response (the agent appends it
after using its tools), and writes:

  - phase2-meta.json — {"files": [...], "new_cmd": "...", "reg_cmd": "..."}
  - prints each file path on stdout, one per line (so the bash caller
    can iterate or verify non-emptiness)

Exits 0 on success, non-zero with a message on stderr otherwise.
"""

from __future__ import annotations

import json
import re
import sys

import yaml


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: parse-phase2-frontmatter.py <phase2-output-file>', file=sys.stderr)
        return 2
    path = sys.argv[1]
    with open(path) as f:
        raw = f.read()

    # Frontmatter is at the END of the response, not the start — the
    # agent uses its tools first, summarizes after. Find ALL `--- ... ---`
    # blocks and take the LAST one.
    matches = list(re.finditer(r'\n---\s*\n([\s\S]*?)\n---\s*(?:\n|$)', raw))
    if not matches:
        print('no frontmatter block found at end of agent output', file=sys.stderr)
        return 1

    fm = yaml.safe_load(matches[-1].group(1)) or {}
    if not isinstance(fm, dict):
        print(f'frontmatter parsed to {type(fm).__name__}, not a dict', file=sys.stderr)
        return 1

    files = fm.get('new_test_files') or []
    new_cmd = fm.get('new_test_command') or ''
    reg_cmd = fm.get('regression_test_command') or ''
    if not isinstance(files, list):
        print('new_test_files is not a list', file=sys.stderr)
        return 1

    with open('phase2-meta.json', 'w') as f:
        json.dump({'files': files, 'new_cmd': new_cmd, 'reg_cmd': reg_cmd}, f)

    for p in files:
        print(p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
