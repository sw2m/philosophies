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

function validateOutputFormat(format, refKind, refLike) {
  const valid = ['diff', 'directory', 'tarball'];
  if (!valid.includes(format)) {
    return { ok: false, error: `invalid output-format: ${format}; must be one of: ${valid.join(', ')}` };
  }
  if (format === 'diff' && refKind !== 'range') {
    const refSuffix = refLike ? ` ${refLike}` : '';
    return { ok: false, error: `diff format requires a range ref-like; got single-ref${refSuffix}` };
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

// Decode a git-quoted C-style path (the contents inside the
// surrounding double quotes). Git emits paths with non-ASCII or
// special characters in C-string-quoted form per `core.quotePath`,
// using octal escapes for high-byte UTF-8 sequences (e.g. `\303\244`
// for `ä`) — JSON.parse cannot decode these. This decoder handles:
//   - `\\` → backslash
//   - `\"` → double-quote
//   - `\a \b \f \n \r \t \v` → corresponding control chars
//   - `\nnn` (one to three octal digits) → byte value, accumulated
//     into a Buffer and decoded as UTF-8
// Returns the decoded string, or null on a malformed escape.
function decodeGitQuotedPath(quoted) {
  if (typeof quoted !== 'string' || quoted.length < 2) return null;
  if (quoted[0] !== '"' || quoted[quoted.length - 1] !== '"') return null;
  const inner = quoted.slice(1, -1);
  const bytes = [];
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch !== '\\') {
      const cp = inner.charCodeAt(i);
      if (cp < 0x80) {
        bytes.push(cp);
      } else {
        const buf = Buffer.from(inner[i], 'utf8');
        for (const b of buf) bytes.push(b);
      }
      i++;
      continue;
    }
    if (i + 1 >= inner.length) return null;
    const next = inner[i + 1];
    if (next >= '0' && next <= '7') {
      let j = i + 1;
      let octal = '';
      while (j < inner.length && octal.length < 3 && inner[j] >= '0' && inner[j] <= '7') {
        octal += inner[j];
        j++;
      }
      const byte = parseInt(octal, 8);
      if (byte > 0xff) return null;
      bytes.push(byte);
      i = j;
      continue;
    }
    const escapes = { '\\': 0x5c, '"': 0x22, 'a': 0x07, 'b': 0x08, 'f': 0x0c, 'n': 0x0a, 'r': 0x0d, 't': 0x09, 'v': 0x0b };
    if (next in escapes) {
      bytes.push(escapes[next]);
      i += 2;
      continue;
    }
    return null;
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch (e) {
    return null;
  }
}

// Parse a `diff --git ...` header line, handling git's C-style
// quoting for paths containing spaces, octal-escaped non-ASCII bytes,
// or other special chars. Paths are quoted as C-style strings
// prefixed with a/ or b/, or appear unquoted with a/<path> b/<path>
// when no escaping needed. Returns { oldPath, newPath } with the a/
// or b/ prefix stripped, or null if the line doesn't parse.
function parseGitDiffHeader(line) {
  const prefix = 'diff --git ';
  if (!line.startsWith(prefix)) return null;
  let rest = line.slice(prefix.length);

  function takeOne(s) {
    // Returns { value, rest } where value is the path with a/ or b/
    // stripped, rest is the remaining string (with leading space removed).
    if (s[0] === '"') {
      let i = 1;
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '"') break;
        i++;
      }
      if (i >= s.length) return null;
      const quoted = s.slice(0, i + 1);
      const decoded = decodeGitQuotedPath(quoted);
      if (decoded === null) return null;
      const stripped = decoded.replace(/^[ab]\//, '');
      return { value: stripped, rest: s.slice(i + 2) };
    }
    const spaceIdx = s.indexOf(' ');
    const part = spaceIdx < 0 ? s : s.slice(0, spaceIdx);
    const stripped = part.replace(/^[ab]\//, '');
    return { value: stripped, rest: spaceIdx < 0 ? '' : s.slice(spaceIdx + 1) };
  }

  const left = takeOne(rest);
  if (!left) return null;
  const right = takeOne(left.rest);
  if (!right) return null;
  return { oldPath: left.value, newPath: right.value };
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
      const parsed = parseGitDiffHeader(line);
      current = {
        header: line,
        lines: [line],
        oldPath: parsed ? parsed.oldPath : null,
        newPath: parsed ? parsed.newPath : null,
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

// Filter diff sections by intersection with a set of filenames that
// passed entryMatchesWhitelist on the JSON metadata. Replaces the
// prior `(path) => boolean` matcher pattern (which was vulnerable to
// quoted-path / regex parsing bugs); the JSON metadata is the source
// of truth for which files survived the whitelist.
function filterDiffSections(sections, matchedFilenames) {
  return sections.filter((section) => {
    if (section.oldPath && matchedFilenames.has(section.oldPath)) return true;
    if (section.newPath && matchedFilenames.has(section.newPath)) return true;
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
  decodeGitQuotedPath,
  parseGitDiffHeader,
  splitDiffByFile,
  filterDiffSections,
  joinDiffSections,
};
