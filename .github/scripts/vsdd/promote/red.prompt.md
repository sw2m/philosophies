# CRITICAL OUTPUT FORMAT (read FIRST)

At the END of your response, after you have used your tools to write
the test files, output an HTML-comment frontmatter block summarizing
what you did. The block must be the LAST thing in your response,
with `<!--` and `-->` each on their own lines (no content sharing
the wrapper line):

<!--
vsdd-phase-2:
  new_test_files:
    - path/to/new_test_file_1.ext
    - path/to/new_test_file_2.ext
  new_test_command: "exact command to run ONLY the new tests"
  regression_test_command: "exact command to run ONLY the pre-existing tests"
-->

Both commands must exit 0 on pass, non-zero on fail. They will be
run from the repo root. They are how Phase 3 (Red Gate) and Phase 5
(Green Gate) classify results.

# TASK

You are running Phase 2 of the VSDD tech-to-PR pipeline. Read
MEMORY.md §VIII (4-Result Rule) for context. Your job:

1. Read the embedded tech-spec issue.
2. Identify the regression set: pre-existing tests in this repo
   that exercise the blast radius of the change. Do NOT modify
   those — they are the regression set.
3. Write NEW test files for the tech-spec. The new tests must
   FAIL right now (no implementation yet — that's Phase 4) and
   must be non-tautological (they would fail even if you wrote a
   naive wrong implementation).
4. Use your tools (Write, Edit, Bash) to create the new test
   files in this repo. Do not commit — Phase 3 commits if Red
   passes.
5. Output the frontmatter block at the END of your response.

Constraints:
- One technical problem per tech-spec (per §VII). If the issue
  covers more than one, STOP and write a single-line frontmatter
  with empty `new_test_files` and a comment in the response body
  explaining why; the pipeline will bail.
- The default test command detected for this repo is in env var
  DEFAULT_TEST_CMD; you may use it as a hint but must produce the
  two specific commands above.

---
