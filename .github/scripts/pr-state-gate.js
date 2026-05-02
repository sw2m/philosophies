// PR state-protection gate logic for #142.
// Consolidates PR CI into single entry with draft-observation history.

const BLESSED_TOKEN = '<!-- vsdd-pr-blessed -->';

function computeProceedState({ isDraft, blessedMarker }) {
  if (isDraft) {
    return { proceed: false, reason: 'draft' };
  }
  if (!blessedMarker) {
    return { proceed: false, reason: 'no-marker' };
  }
  return { proceed: true };
}

function hasBlessedMarker(body) {
  if (!body) return false;
  const pattern = /^<!-- vsdd-pr-blessed -->[ \t]*$/m;
  return pattern.test(body);
}

function parseCommentKey(body) {
  if (!body) return null;
  const match = body.match(/^<!-- vsdd-pr-comment\n([\s\S]*?)-->/);
  if (!match) return null;
  const block = match[1];
  const keyMatch = block.match(/^key:\s*(\S+)/m);
  const shaMatch = block.match(/^sha:\s*(\S+)/m);
  if (!keyMatch || !shaMatch) return null;
  return { key: keyMatch[1], sha: shaMatch[1] };
}

function findCommentByKey(comments, key, sha) {
  if (!comments) return null;
  for (const c of comments) {
    if (c.user?.login !== 'github-actions[bot]') continue;
    const parsed = parseCommentKey(c.body);
    if (parsed && parsed.key === key && parsed.sha === sha) {
      return c;
    }
  }
  return null;
}

function shouldAutoConvertToDraft({ isDraft, blessedMarker }) {
  return !isDraft && !blessedMarker;
}

module.exports = {
  BLESSED_TOKEN,
  computeProceedState,
  hasBlessedMarker,
  parseCommentKey,
  findCommentByKey,
  shouldAutoConvertToDraft,
};
