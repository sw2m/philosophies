// Phase 3 per-category budget state persistence: round counting via comment
// frontmatter, terminal-state detection, and verdict processing. Pure module
// (no I/O) — the workflow drives API calls, this module drives the text
// transform and state queries.
//
// Spec: sw2m/philosophies#182. Goal: sw2m/philosophies#167.

const INITIAL_BUDGET = 7;
const BUDGET_STEP = 2;

const MARKER_REGEX = /^(\s*[-*]\s*`?)\(blocking\)(`?)/gim;
const VERDICT_REGEX = /^_Verdict:\s*`?(pass|fail)`?_\s*$/m;

function fencedRanges(body) {
  const ranges = [];
  const re = /```[\s\S]*?```/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function inFence(pos, ranges) {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}

function computeBudget(round) {
  return Math.max(0, INITIAL_BUDGET - BUDGET_STEP * (round - 1));
}

function demoteExcess(body, budget) {
  const fences = fencedRanges(body);
  let count = 0;
  let demoted = 0;
  const newBody = body.replace(
    MARKER_REGEX,
    (match, prefix, suffix, offset) => {
      if (inFence(offset, fences)) return match;
      count += 1;
      if (count > budget) {
        demoted += 1;
        return `${prefix}(advisory; over-budget)${suffix}`;
      }
      return match;
    },
  );
  return { body: newBody, demoted, originalCount: count };
}

function countMarkers(body) {
  const fences = fencedRanges(body);
  let count = 0;
  let m;
  MARKER_REGEX.lastIndex = 0;
  while ((m = MARKER_REGEX.exec(body)) !== null) {
    if (!inFence(m.index, fences)) count += 1;
  }
  return count;
}

function frontmatterRegexFor(category, reviewer) {
  return new RegExp(
    `^<!--\\s*vsdd-phase-3\\s*\\ncategory:\\s*${category}\\s*\\nreviewer:\\s*${reviewer}\\s*\\n`,
  );
}

function parseFrontmatter(body) {
  const match = body.match(
    /^<!--\s*vsdd-phase-3\s*\ncategory:\s*(\S+)\s*\nreviewer:\s*(\S+)\s*\nverdict:\s*(\S+)\s*\n(?:reason:\s*(\S+)\s*\n)?commit-sha:\s*([a-f0-9]{40})\s*\nround:\s*(\S+)\s*\n(?:retries-exhausted:\s*(\S+)\s*\n)?-->/,
  );
  if (!match) return null;
  return {
    category: match[1],
    reviewer: match[2],
    verdict: match[3],
    reason: match[4] || null,
    commitSha: match[5],
    round: match[6] === 'pending' ? 'pending' : parseInt(match[6], 10),
    retriesExhausted: match[7] === 'true',
  };
}

function computeSharedRound(comments, category) {
  const gRe = frontmatterRegexFor(category, 'gemini');
  const cRe = frontmatterRegexFor(category, 'claude');

  const g = comments.filter((c) => {
    const body = c.body || '';
    if (!gRe.test(body)) return false;
    const parsed = parseFrontmatter(body);
    return parsed && (parsed.verdict === 'pass' || parsed.verdict === 'fail');
  }).length;

  const c = comments.filter((c) => {
    const body = c.body || '';
    if (!cRe.test(body)) return false;
    const parsed = parseFrontmatter(body);
    return parsed && (parsed.verdict === 'pass' || parsed.verdict === 'fail');
  }).length;

  return Math.max(g, c) + 1;
}

function latestVerdict(comments, category, reviewer) {
  const re = frontmatterRegexFor(category, reviewer);
  let latest = null;
  for (const c of comments) {
    const body = c.body || '';
    if (re.test(body)) {
      const parsed = parseFrontmatter(body);
      if (parsed) latest = parsed;
    }
  }
  return latest;
}

function terminalState(parsed) {
  if (!parsed) return false;
  return parsed.verdict === 'pass' && parsed.reason !== 'inapplicable';
}

function buildFrontmatter({ category, reviewer, verdict, reason, commitSha, round, retriesExhausted }) {
  let fm = `<!-- vsdd-phase-3\ncategory: ${category}\nreviewer: ${reviewer}\nverdict: ${verdict}\n`;
  if (reason) fm += `reason: ${reason}\n`;
  fm += `commit-sha: ${commitSha}\nround: ${round}\n`;
  if (retriesExhausted) fm += `retries-exhausted: true\n`;
  fm += '-->';
  return fm;
}

function processReview({ body, round, budget, category, reviewer, commitSha }) {
  const { body: demotedBody, demoted } = demoteExcess(body, budget);
  const remaining = countMarkers(demotedBody);

  let finalBody = demotedBody;
  let verdict;

  const verdictMatch = finalBody.match(VERDICT_REGEX);
  if (!verdictMatch) {
    finalBody = `${finalBody.replace(/\s+$/, '')}\n\n_Verdict: \`fail\`_\n`;
    verdict = 'fail';
  } else if (remaining === 0 && verdictMatch[1].toLowerCase() === 'fail') {
    finalBody = finalBody.replace(VERDICT_REGEX, '_Verdict: `pass`_');
    verdict = 'pass';
  } else {
    verdict = verdictMatch[1].toLowerCase();
  }

  if (demoted > 0) {
    const note =
      `_Budget note: round ${round} budget ${budget}; ` +
      `demoted ${demoted} blocker(s) to advisory._`;
    finalBody = finalBody.replace(VERDICT_REGEX, (verdictLine) => {
      return `${note}\n\n${verdictLine}`;
    });
  }

  const frontmatter = buildFrontmatter({
    category,
    reviewer,
    verdict,
    reason: null,
    commitSha,
    round,
    retriesExhausted: false,
  });

  finalBody = `${frontmatter}\n\n${finalBody}`;

  return { body: finalBody, verdict, demoted, round, budget };
}

module.exports = {
  INITIAL_BUDGET,
  BUDGET_STEP,
  MARKER_REGEX,
  VERDICT_REGEX,
  frontmatterRegexFor,
  parseFrontmatter,
  computeSharedRound,
  computeBudget,
  latestVerdict,
  terminalState,
  buildFrontmatter,
  demoteExcess,
  countMarkers,
  processReview,
};
