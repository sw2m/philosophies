// Forgiving verdict extractor — pulls "verdict: pass|fail" out of an agent
// response in three escalating ways, returning {verdict, body} or
// {verdict: null, body: text} when nothing matches.
//
//   1. Strict YAML frontmatter at the very top of the file
//      (---\nverdict: ...\n---)
//   2. An embedded frontmatter block anywhere in the doc
//   3. A bare "verdict: pass|fail" line anywhere
//
// Used by both pr-review.yml's gemini-review and claude-review post-steps.
// `require` it from a github-script step:
//
//   const { extractVerdict } = require('./.github/scripts/extract-verdict.js');

function extractVerdict(text) {
  // 1. Strict frontmatter at the top.
  const m1 = text.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (m1) {
    const fm = m1[1].match(/^\s*verdict\s*:\s*(pass|fail)\s*$/im);
    if (fm) return { verdict: fm[1].toLowerCase(), body: m1[2].trim() };
  }
  // 2. Embedded frontmatter block.
  const m2 = text.match(/\n---\s*\n(verdict\s*:\s*(?:pass|fail)[\s\S]*?)\n---\s*\n/);
  if (m2) {
    const fm = m2[1].match(/^\s*verdict\s*:\s*(pass|fail)\s*$/im);
    if (fm) return { verdict: fm[1].toLowerCase(), body: text };
  }
  // 3. Bare 'verdict: pass|fail' anywhere.
  const m3 = text.match(/^\s*\**\s*verdict\s*\**\s*[:=]\s*\**\s*(pass|fail)\b/im);
  if (m3) return { verdict: m3[1].toLowerCase(), body: text };

  return { verdict: null, body: text };
}

module.exports = { extractVerdict };
