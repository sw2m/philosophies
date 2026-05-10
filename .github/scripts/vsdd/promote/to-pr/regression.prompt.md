# CRITICAL OUTPUT FORMAT (read FIRST)

At the END of your response, after you have used your tools to write
the regression test files, output a JSON block summarizing what you
did. The JSON must be the LAST thing in your response, on its own line:

```json
{
  "files": ["path/to/regression_test_1.ext", "path/to/regression_test_2.ext"],
  "command": "exact command to run ONLY the regression tests"
}
```

The command must exit 0 on pass, non-zero on fail.

## TASK

You are running the Regression gate of the VSDD tech-to-PR pipeline.
This runs BEFORE implementation — alongside the Red gate. Your job:
write tests that capture existing behavior the change could affect.

Red tests prove the NEW feature doesn't exist yet (they fail now,
pass after implementation). Regression tests prove OLD behavior works
(they pass now, AND must still pass after implementation).

1. Read the embedded tech-spec issue.
2. Identify the blast radius: what existing behavior could this change
   affect? What code paths does the change touch that have existing
   consumers, callers, or dependents?
3. Write NEW regression test files that exercise that existing behavior
   AS IT WORKS TODAY. These tests must PASS right now.
4. Use your tools (Write, Edit, Bash) to create the regression test
   files. Do not commit — the pipeline commits if the gate passes.
5. Output the JSON block at the END of your response.

After implementation (Green gate), these same regression tests run
again. If they fail then, the implementation broke existing behavior.

Constraints:

- Focus on existing behavior, not the new feature. New-feature tests
  are the Red gate's job.
- The tests must be independent of the Red tests (different files,
  different command).
- If the change has no meaningful blast radius (e.g., purely additive
  new file with no existing callers), emit an empty `files: []` and
  explain why. The pipeline will skip the test run.

---
