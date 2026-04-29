// Phase 1c blocker-budget: round counting, structural-marker demotion, verdict
// rewrite. Pure module (no I/O, no GitHub-API calls) so the workflow drives the
// API and this module drives the text transform — keeping the demote logic
// testable in isolation.
//
// Spec: sw2m/philosophies#88. Goal: sw2m/philosophies#87.

const INITIAL_BUDGET = 7;
const BUDGET_STEP = 2;

// Structural marker: `(blocking)` only at the start of a markdown bullet,
// optionally wrapped in backticks. Loose `(blocking)` substrings inside prose,
// fenced code blocks, or pseudocode examples are not counted.
const MARKER_REGEX = /^(\s*[-*]\s*`?)\(blocking\)(`?)/gim;

// Verdict line: `_Verdict: \`pass\`_` or `_Verdict: \`fail\`_` on its own line.
const VERDICT_REGEX = /^_Verdict:\s*`?(pass|fail)`?_\s*$/m;

function frontmatterRegexFor(reviewer) {
  // Matches a comment whose body opens with the literal frontmatter block:
  //   <!-- vsdd-phase-1c
  //   reviewer: <slug>
  //   ...
  //   -->
  // No `m` flag — the frontmatter must open the comment body, not appear on
  // any random line. A frontmatter-shaped block buried mid-comment is not a
  // round signal.
  return new RegExp(
    `^<!--\\s*vsdd-phase-1c\\s*\\nreviewer:\\s*${reviewer}\\s*\\n`,
  );
}

function computeRound(comments, reviewer) {
  const re = frontmatterRegexFor(reviewer);
  const prior = comments.filter((c) => re.test(c.body || '')).length;
  return prior + 1;
}

function computeBudget(round) {
  return Math.max(0, INITIAL_BUDGET - BUDGET_STEP * (round - 1));
}

// Demote any structural `(blocking)` markers past `budget` to
// `(advisory; over-budget)`. Returns { body, demoted, originalCount }.
function demoteExcess(body, budget) {
  let count = 0;
  let demoted = 0;
  const newBody = body.replace(MARKER_REGEX, (match, prefix, suffix) => {
    count += 1;
    if (count > budget) {
      demoted += 1;
      return `${prefix}(advisory; over-budget)${suffix}`;
    }
    return match;
  });
  return { body: newBody, demoted, originalCount: count };
}

// Count remaining structural `(blocking)` markers (post-demotion).
function countMarkers(body) {
  return (body.match(MARKER_REGEX) || []).length;
}

// Process a reviewer's review.md content for a given round and reviewer slug.
// Returns { body, verdict, demoted, round, budget }.
function processReview({ body, round, budget }) {
  const { body: demotedBody, demoted } = demoteExcess(body, budget);
  const remaining = countMarkers(demotedBody);

  let finalBody = demotedBody;
  let verdict;

  const verdictMatch = finalBody.match(VERDICT_REGEX);
  if (!verdictMatch) {
    // Verdict-line-not-found fallback. Append a fail verdict so the existing
    // `phase-1c-clearance` consumer sees something parseable; preserve the
    // reviewer's prose verbatim above it for human inspection.
    finalBody = `${finalBody.replace(/\s+$/, '')}\n\n_Verdict: \`fail\`_\n`;
    verdict = 'fail';
  } else if (remaining === 0 && verdictMatch[1].toLowerCase() === 'fail') {
    // Demotion left no blockers; force the verdict to pass.
    finalBody = finalBody.replace(VERDICT_REGEX, '_Verdict: `pass`_');
    verdict = 'pass';
  } else {
    verdict = verdictMatch[1].toLowerCase();
  }

  // Insert the budget note immediately before the verdict line.
  if (demoted > 0) {
    const note =
      `_Budget note: round ${round} budget ${budget}; ` +
      `demoted ${demoted} blocker(s) to advisory._`;
    finalBody = finalBody.replace(VERDICT_REGEX, (verdictLine) => {
      return `${note}\n\n${verdictLine}`;
    });
  }

  return { body: finalBody, verdict, demoted, round, budget };
}

module.exports = {
  INITIAL_BUDGET,
  BUDGET_STEP,
  MARKER_REGEX,
  VERDICT_REGEX,
  frontmatterRegexFor,
  computeRound,
  computeBudget,
  demoteExcess,
  countMarkers,
  processReview,
};
