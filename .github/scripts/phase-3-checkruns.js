'use strict';

const CATEGORIES = {
  'multi-word-symbols': 'Phase 3 / Multi-word symbols (§IX)',
  'error-structure': 'Phase 3 / Error structure (§IX)',
  'spec-discipline': 'Phase 3 / Spec discipline (§VII)',
  'security-surface': 'Phase 3 / Security surface (§II)',
  'spec-gaps': 'Phase 3 / Spec gaps (§II)',
  'purity-boundary': 'Phase 3 / Purity boundary (§II)',
};

const GLOBAL_AGGREGATE = 'Phase 3 / Aggregate';

function name(slug, reviewer) {
  const base = CATEGORIES[slug];
  if (!base) throw new Error(`Unknown category slug: ${slug}`);
  return reviewer ? `${base} — ${reviewer}` : base;
}

function conclude(g, c) {
  if (g === 'fail' || c === 'fail') return 'failure';
  if (g === 'pending' || c === 'pending') return 'action_required';
  if (g === 'pass' && c === 'pass') return 'success';
  return 'action_required';
}

function title(round, verdict, opts = {}) {
  const { stale, terminal, head } = opts;
  if (stale && terminal && head) {
    return `terminal-stated at ${terminal.slice(0, 8)}; HEAD ${head.slice(0, 8)} not reviewed`;
  }
  return `round ${round}: ${verdict}`;
}

function summary(body, opts = {}) {
  const { stale, terminal } = opts;
  if (stale && terminal) {
    return `Stale: this category terminal-stated at ${terminal.slice(0, 8)}; the body below is the prior review.\n\n${body}`;
  }
  return body;
}

async function create(github, context, slug, reviewer, sha, opts = {}) {
  const { round = 1, status = 'in_progress' } = opts;
  const n = name(slug, reviewer);
  const res = await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status,
    output: {
      title: title(round, 'pending'),
      summary: `Check run started for ${n}`,
    },
  });
  return res.data.id;
}

async function update(github, context, id, conclusion, opts = {}) {
  const { round = 1, verdict, body = '', stale, terminal, head } = opts;
  const t = title(round, verdict ?? conclusion, { stale, terminal, head });
  const s = summary(body, { stale, terminal });
  await github.rest.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    check_run_id: id,
    status: 'completed',
    conclusion,
    output: { title: t, summary: s },
  });
}

async function cancel(github, context, id, opts = {}) {
  const { round = 1 } = opts;
  await github.rest.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    check_run_id: id,
    status: 'completed',
    conclusion: 'cancelled',
    output: { title: `round ${round}: cancelled mid-run`, summary: 'Workflow cancelled.' },
  });
}

async function aggregate(github, context, slug, sha, g, c, opts = {}) {
  const conclusion = conclude(g, c);
  const n = name(slug, null);
  const { round = 1, body = '', stale, terminal, head } = opts;
  const t = title(round, conclusion === 'success' ? 'pass' : conclusion === 'failure' ? 'fail' : 'pending', { stale, terminal, head });
  const s = summary(body, { stale, terminal });
  await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status: 'completed',
    conclusion,
    output: { title: t, summary: s },
  });
}

async function inapplicable(github, context, slug, sha) {
  const n = name(slug, null);
  await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: n,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    output: { title: 'round 1: pass (inapplicable)', summary: 'Category not applicable to this PR.' },
  });
}

module.exports = {
  CATEGORIES,
  GLOBAL_AGGREGATE,
  name,
  conclude,
  title,
  summary,
  create,
  update,
  cancel,
  aggregate,
  inapplicable,
};
