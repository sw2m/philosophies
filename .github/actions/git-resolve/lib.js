'use strict';

// Pure core library for git-resolve action.
// No I/O, no network, no time - unit-testable in isolation.

const PR_SHORTHAND_RE = /^#(\d+)$/;
const THREE_DOT_RANGE_RE = /^(.+)\.\.\.(.+)$/;
const TWO_DOT_RANGE_RE = /^(.+)\.\.([^.].*)$/;
const PATH_TRAVERSAL_RE = /(^|\/)\.\.(\/|$)/;
const NEGATION_RE = /^!/;

function parseRefLike(s) {
  if (s === null || s === undefined) s = '';
  s = String(s).trim();

  if (s === '') {
    return { kind: 'empty', sides: [] };
  }

  const rangeMatch = s.match(THREE_DOT_RANGE_RE);
  if (rangeMatch) {
    const left = rangeMatch[1].trim();
    const right = rangeMatch[2].trim();
    if (!left || !right) {
      return { kind: 'error', error: 'empty side in range expression' };
    }
    return { kind: 'range', sides: [left, right] };
  }

  if (TWO_DOT_RANGE_RE.test(s) || /\.\.(?!\.)/.test(s)) {
    return {
      kind: 'error',
      error: 'two-dot range syntax not supported; use three-dot (A...B)',
    };
  }

  return { kind: 'single', sides: [s] };
}

function isPrShorthand(s) {
  return PR_SHORTHAND_RE.test(s);
}

function extractPrNumber(s) {
  const match = s.match(PR_SHORTHAND_RE);
  return match ? parseInt(match[1], 10) : null;
}

function parseWhitelist(text) {
  if (text === null || text === undefined) text = '';
  text = String(text);

  const patterns = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    if (NEGATION_RE.test(line)) {
      return {
        error: `whitelist pattern at line ${i + 1} uses negation (!pattern); negation is out of scope`,
        line: i + 1,
      };
    }

    if (PATH_TRAVERSAL_RE.test(line)) {
      return {
        error: `whitelist pattern ${line} at line ${i + 1} contains path traversal; rejected`,
        line: i + 1,
      };
    }

    if (line.startsWith('/')) {
      return {
        error: `whitelist pattern at line ${i + 1} is an absolute path; rejected`,
        line: i + 1,
      };
    }

    patterns.push(line);
  }

  return { patterns };
}

function compileMatcher(patterns, picomatch) {
  if (!patterns || patterns.length === 0) {
    return () => true;
  }

  try {
    const matcher = picomatch(patterns, { dot: true });
    return matcher;
  } catch (e) {
    return { error: `invalid whitelist pattern: ${e.message}` };
  }
}

function entryMatchesWhitelist(entry, matcher) {
  if (!entry || typeof entry.filename !== 'string') return false;
  if (matcher(entry.filename)) return true;
  if (entry.previous_filename && matcher(entry.previous_filename)) return true;
  return false;
}

function validateOutputFormat(format, refKind) {
  const valid = ['diff', 'directory', 'tarball'];
  if (!valid.includes(format)) {
    return { ok: false, error: `invalid output-format: ${format}; must be one of: ${valid.join(', ')}` };
  }
  if (format === 'diff' && refKind !== 'range') {
    return { ok: false, error: `diff format requires a range ref-like; got single-ref` };
  }
  return { ok: true };
}

function formatGitlinkContent(sha) {
  return sha + '\n';
}

function parseCompareApiResponse(json) {
  const result = {
    files: [],
    hadTruncation: false,
    truncationReason: null,
    status: json.status || null,
    mergeBaseCommit: json.merge_base_commit || null,
    baseSha: json.base_commit ? json.base_commit.sha : null,
    headSha: json.head ? json.head.sha : (json.commits && json.commits.length > 0 ? json.commits[json.commits.length - 1].sha : null),
    totalFiles: json.files ? json.files.length : 0,
    changedFiles: json.changed_files || 0,
  };

  if (!json.merge_base_commit && json.status === 'diverged') {
    result.hadTruncation = true;
    result.truncationReason = 'no common ancestor';
  }

  if (json.files) {
    for (const file of json.files) {
      const entry = {
        filename: file.filename,
        status: file.status,
        sha: file.sha,
        previous_filename: file.previous_filename || null,
        patch: file.patch || null,
        truncated: false,
      };

      if (file.patch === undefined && file.status !== 'removed' && file.sha) {
        entry.truncated = true;
        result.hadTruncation = true;
        if (!result.truncationReason) {
          result.truncationReason = `diff for ${file.filename} exceeds compare API per-file truncation cap`;
        }
      }

      result.files.push(entry);
    }
  }

  if (result.totalFiles >= 300) {
    result.hadTruncation = true;
    result.truncationReason = 'diff exceeds compare API total-files cap; use a different scope or split the range';
  }

  return result;
}

function parsePullsApiResponse(json) {
  return {
    baseSha: json.base ? json.base.sha : null,
    headSha: json.head ? json.head.sha : null,
    baseRef: json.base ? json.base.ref : null,
    headRef: json.head ? json.head.ref : null,
    changedFiles: json.changed_files || 0,
  };
}

function parseTreesApiResponse(json) {
  const result = {
    sha: json.sha || null,
    truncated: json.truncated || false,
    entries: [],
  };

  if (json.tree) {
    for (const item of json.tree) {
      result.entries.push({
        path: item.path,
        type: item.type,
        mode: item.mode,
        sha: item.sha,
        size: item.size || null,
      });
    }
  }

  return result;
}

function validateSymlinkTarget(target, symlinkPath, rootPath) {
  if (!target || target.length === 0) {
    return { ok: false, error: 'empty symlink target' };
  }

  if (target.startsWith('/')) {
    return { ok: false, error: `symlink target ${target} is absolute; escapes materialization root` };
  }

  if (PATH_TRAVERSAL_RE.test(target)) {
    return { ok: false, error: `symlink target ${target} escapes materialization root` };
  }

  return { ok: true };
}

function countLeafEntries(entries) {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === 'blob' || entry.type === 'commit') {
      count++;
    }
  }
  return count;
}

function countDiffFiles(files) {
  return files.length;
}

function splitDiffByFile(diffText) {
  const sections = [];
  const lines = diffText.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        sections.push(current);
      }
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      current = {
        header: line,
        lines: [line],
        oldPath: match ? match[1] : null,
        newPath: match ? match[2] : null,
      };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function filterDiffSections(sections, matcher) {
  return sections.filter((section) => {
    if (section.oldPath && matcher(section.oldPath)) return true;
    if (section.newPath && matcher(section.newPath)) return true;
    return false;
  });
}

function joinDiffSections(sections) {
  return sections.map((s) => s.lines.join('\n')).join('\n');
}

module.exports = {
  parseRefLike,
  isPrShorthand,
  extractPrNumber,
  parseWhitelist,
  compileMatcher,
  entryMatchesWhitelist,
  validateOutputFormat,
  formatGitlinkContent,
  parseCompareApiResponse,
  parsePullsApiResponse,
  parseTreesApiResponse,
  validateSymlinkTarget,
  countLeafEntries,
  countDiffFiles,
  splitDiffByFile,
  filterDiffSections,
  joinDiffSections,
};
