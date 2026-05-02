// Phase 1c cardinality: count parsing, classification, per-axis-min selection,
// orchestrator frontmatter generation/parsing. Pure module (no I/O).
//
// Spec: sw2m/philosophies#128. Goal: sw2m/philosophies#125.

function isValidCount(value) {
  if (value === null || value === undefined || value === '') return false;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) return false;
  if (!Number.isInteger(num)) return false;
  return num >= 1;
}

function parseCountTuple(frontmatter) {
  const subjectsMatch = frontmatter.match(/subjects:\s*(\S+)/);
  const outcomesMatch = frontmatter.match(/outcomes:\s*(\S+)/);
  if (!subjectsMatch || !outcomesMatch) return null;

  const subjects = parseInt(subjectsMatch[1], 10);
  const outcomes = parseInt(outcomesMatch[1], 10);

  if (!isValidCount(subjects) || !isValidCount(outcomes)) return null;
  return { subjects, outcomes };
}

function computeClassification(tuple) {
  const min = Math.min(tuple.subjects, tuple.outcomes);
  return { min, isSingleTechSpec: min === 1 };
}

function perAxisMin(a, b) {
  return {
    subjects: Math.min(a.subjects, b.subjects),
    outcomes: Math.min(a.outcomes, b.outcomes),
  };
}

function buildOrchestratorFrontmatter({ verdict, subjects, outcomes }) {
  let fm = `<!-- vsdd-phase-1c\nreviewer: orchestrator\nverdict: ${verdict}`;
  if (subjects !== undefined) fm += `\nsubjects: ${subjects}`;
  if (outcomes !== undefined) fm += `\noutcomes: ${outcomes}`;
  fm += '\n-->';
  return fm;
}

function parseOrchestratorFrontmatter(body) {
  const fmMatch = body.match(/<!--\s*vsdd-phase-1c\s*\n([\s\S]*?)-->/);
  if (!fmMatch) return null;

  const block = fmMatch[1];
  const reviewerMatch = block.match(/reviewer:\s*(\S+)/);
  if (!reviewerMatch || reviewerMatch[1] !== 'orchestrator') return null;

  const verdictMatch = block.match(/verdict:\s*(\S+)/);
  const subjectsMatch = block.match(/subjects:\s*(\S+)/);
  const outcomesMatch = block.match(/outcomes:\s*(\S+)/);

  const result = {
    reviewer: 'orchestrator',
    verdict: verdictMatch ? verdictMatch[1] : undefined,
  };

  if (subjectsMatch) result.subjects = parseInt(subjectsMatch[1], 10);
  if (outcomesMatch) result.outcomes = parseInt(outcomesMatch[1], 10);

  return result;
}

function extractReviewerTuples(comments) {
  const result = { gemini: null, claude: null };

  const botComments = comments
    .filter((c) => c.user && c.user.login === 'github-actions[bot]')
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at) : new Date(0);
      const db = b.created_at ? new Date(b.created_at) : new Date(0);
      return db - da;
    });

  for (const reviewer of ['gemini', 'claude']) {
    for (const c of botComments) {
      const fmMatch = (c.body || '').match(
        /<!--\s*vsdd-phase-1c\s*\n([\s\S]*?)-->/,
      );
      if (!fmMatch) continue;

      const block = fmMatch[1];
      const reviewerMatch = block.match(/reviewer:\s*(\S+)/);
      if (!reviewerMatch || reviewerMatch[1] !== reviewer) continue;

      const tuple = parseCountTuple(c.body);
      result[reviewer] = tuple;
      break;
    }
  }

  return result;
}

module.exports = {
  isValidCount,
  parseCountTuple,
  computeClassification,
  perAxisMin,
  buildOrchestratorFrontmatter,
  parseOrchestratorFrontmatter,
  extractReviewerTuples,
};
