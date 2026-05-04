#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const lib = require('./lib.js');

let picomatch;
try {
  picomatch = require('picomatch');
} catch (e) {
  console.error('::error::picomatch not installed; run npm install picomatch');
  process.exit(1);
}

const cmd = process.argv[2];

function gh(args, opts = {}) {
  const result = spawnSync('gh', args, {
    encoding: opts.binary ? 'buffer' : 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, GH_PAGER: '' },
  });
  if (result.error) {
    throw new Error(`gh command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = opts.binary ? result.stderr.toString() : result.stderr;
    if (/rate limit|API rate limit exceeded|secondary rate limit/i.test(stderr)) {
      const resetMatch = stderr.match(/reset[s]?\s+at\s+(\S+)/i);
      const resetInfo = resetMatch ? `; resets at ${resetMatch[1]}` : '';
      console.error(`::error::GitHub API rate limit exhausted${resetInfo}`);
      process.exit(1);
    }
    throw new Error(`gh exited ${result.status}: ${stderr}`);
  }
  return opts.binary ? result.stdout : result.stdout;
}

// Try a local git command. Returns stdout (trimmed) on success, null on
// any failure. Non-throwing — caller decides whether to fall back.
function gitLocal(args) {
  try {
    const result = spawnSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) return null;
    return result.stdout.trim();
  } catch (e) {
    return null;
  }
}

function writeOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    fs.appendFileSync(file, `${key}=${value}\n`);
  }
  console.log(`${key}=${value}`);
}

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.log(`::warning::${msg}`);
}

if (cmd === 'parse-ref') {
  const input = process.argv[3] || '';
  const result = lib.parseRefLike(input);
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (cmd === 'parse-whitelist') {
  const input = process.argv[3] || '';
  const result = lib.parseWhitelist(input);
  if (result.error) {
    fail(result.error);
  }
  console.log(JSON.stringify(result.patterns));
  process.exit(0);
}

if (cmd === 'resolve') {
  const refInput = process.argv[3] || '';
  const whitelistInput = process.argv[4] || '';
  const outputFormat = process.argv[5] || 'directory';
  const prShorthandBase = process.argv[6] || process.env.GITHUB_REPOSITORY || '';
  const outputDir = process.argv[7] || path.join(process.env.RUNNER_TEMP || '/tmp', 'git-resolve');

  const parsed = lib.parseRefLike(refInput);
  if (parsed.kind === 'error') {
    fail(parsed.error);
  }

  const whitelistResult = lib.parseWhitelist(whitelistInput);
  if (whitelistResult.error) {
    fail(whitelistResult.error);
  }
  const patterns = whitelistResult.patterns;

  const matcherResult = lib.compileMatcher(patterns, picomatch);
  if (matcherResult && matcherResult.error) {
    fail(matcherResult.error);
  }
  const matcher = matcherResult;

  let refKind = parsed.kind;
  let resolvedRef = '';
  let baseSha = null;
  let headSha = null;

  const repo = process.env.GITHUB_REPOSITORY || '';

  if (parsed.kind === 'empty') {
    const repoInfo = JSON.parse(gh(['api', `repos/${repo}`, '--jq', '.']));
    if (!repoInfo.default_branch) {
      fail('repository has no default branch');
    }
    const branch = repoInfo.default_branch;
    const refInfo = resolveExactRefObject(repo, 'heads', branch);
    if (!refInfo) {
      fail(`default branch ref not found: refs/heads/${branch}`);
    }
    headSha = refInfo.object.sha;
    resolvedRef = headSha;
    refKind = 'single';
  } else if (parsed.kind === 'single') {
    const side = parsed.sides[0];
    if (lib.isPrShorthand(side)) {
      const prNum = lib.extractPrNumber(side);
      const prInfo = JSON.parse(gh(['api', `repos/${prShorthandBase}/pulls/${prNum}`]));
      const prData = lib.parsePullsApiResponse(prInfo);
      baseSha = prData.baseSha;
      headSha = prData.headSha;
      resolvedRef = `${baseSha}...${headSha}`;
      refKind = 'range';
    } else {
      headSha = resolveRef(side, repo);
      resolvedRef = headSha;
    }
  } else if (parsed.kind === 'range') {
    const leftSide = parsed.sides[0];
    const rightSide = parsed.sides[1];

    if (lib.isPrShorthand(leftSide)) {
      const prNum = lib.extractPrNumber(leftSide);
      const prInfo = JSON.parse(gh(['api', `repos/${prShorthandBase}/pulls/${prNum}`]));
      baseSha = lib.parsePullsApiResponse(prInfo).headSha;
    } else {
      baseSha = resolveRef(leftSide, repo);
    }

    if (lib.isPrShorthand(rightSide)) {
      const prNum = lib.extractPrNumber(rightSide);
      const prInfo = JSON.parse(gh(['api', `repos/${prShorthandBase}/pulls/${prNum}`]));
      headSha = lib.parsePullsApiResponse(prInfo).headSha;
    } else {
      headSha = resolveRef(rightSide, repo);
    }

    resolvedRef = `${baseSha}...${headSha}`;
  }

  const validation = lib.validateOutputFormat(outputFormat, refKind, refInput || resolvedRef);
  if (!validation.ok) {
    fail(validation.error);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let outputPath = '';
  let fileCount = 0;

  if (outputFormat === 'diff') {
    outputPath = path.join(outputDir, 'git-resolve.diff');

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const compareJson = JSON.parse(gh(['api', `repos/${repo}/compare/${baseSha}...${headSha}`]));
    const compareData = lib.parseCompareApiResponse(compareJson);

    if (!compareData.mergeBaseCommit && compareData.status === 'diverged') {
      fail(`no common ancestor between ${baseSha} and ${headSha}`);
    }

    if (compareData.hadTruncation && compareData.truncationReason) {
      if (compareData.truncationReason.includes('total-files cap')) {
        fail(compareData.truncationReason);
      }
      for (const file of compareData.files) {
        if (file.truncated) {
          fail(`diff for ${file.filename} exceeds compare API per-file truncation cap`);
        }
      }
    }

    // Filter via JSON metadata, not regex on diff text. The compare
    // API's files[] gives unambiguous filename + previous_filename
    // (handles renames + paths with spaces correctly); the text-diff
    // sections are then filtered by intersection with the post-
    // whitelist filename set. Per #165 Phase 3 review on PR — the
    // prior regex-based path extraction broke on quoted paths and
    // mis-parsed paths containing ` b/`.
    const matchedEntries = compareData.files.filter((e) => lib.entryMatchesWhitelist(e, matcher));
    const matchedFilenames = new Set();
    for (const e of matchedEntries) {
      if (e.filename) matchedFilenames.add(e.filename);
      if (e.previous_filename) matchedFilenames.add(e.previous_filename);
    }

    // Local git first for the diff text (per spec acceptance #9 +
    // Phase 3 review). Falls back to compare API when local can't
    // produce the diff (shallow checkout, missing objects, etc.).
    let diffText = gitLocal(['diff', `${baseSha}...${headSha}`]);
    if (!diffText) {
      diffText = gh(['api', `repos/${repo}/compare/${baseSha}...${headSha}`, '-H', 'Accept: application/vnd.github.diff']);
    }

    const sections = lib.splitDiffByFile(diffText);
    const filtered = lib.filterDiffSections(sections, matchedFilenames);
    const output = lib.joinDiffSections(filtered);

    fs.writeFileSync(outputPath, output);
    fileCount = matchedEntries.length;

  } else {
    const treeDir = path.join(outputDir, 'git-resolve-out');
    const tarPath = path.join(outputDir, 'git-resolve.tar.gz');

    if (fs.existsSync(treeDir)) {
      fs.rmSync(treeDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }

    const treeSha = headSha;
    const treeJson = JSON.parse(gh(['api', `repos/${repo}/git/trees/${treeSha}?recursive=1`]));
    const treeData = lib.parseTreesApiResponse(treeJson);

    if (treeData.truncated) {
      fail('tree exceeds API recursion limit; tree response truncated');
    }

    const filtered = treeData.entries.filter((entry) => {
      if (entry.type === 'tree') return false;
      return matcher(entry.path);
    });

    if (filtered.length > 500 && patterns.length === 0) {
      warn(`Materializing ${filtered.length} files with no whitelist filter; this may exhaust API rate limits`);
    }

    fs.mkdirSync(treeDir, { recursive: true });

    for (const entry of filtered) {
      const fullPath = path.join(treeDir, entry.path);
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });

      if (entry.type === 'commit') {
        const gitlinkDir = fullPath;
        fs.mkdirSync(gitlinkDir, { recursive: true });
        fs.writeFileSync(path.join(gitlinkDir, '.gitlink'), lib.formatGitlinkContent(entry.sha));
      } else if (entry.type === 'blob') {
        if (entry.mode === '120000') {
          const content = gh(['api', `repos/${repo}/git/blobs/${entry.sha}`, '-H', 'Accept: application/vnd.github.raw']);
          const target = content.trim();
          const validation = lib.validateSymlinkTarget(target, entry.path, treeDir);
          if (!validation.ok) {
            fail(validation.error);
          }
          fs.symlinkSync(target, fullPath);
        } else {
          const content = gh(['api', `repos/${repo}/git/blobs/${entry.sha}`, '-H', 'Accept: application/vnd.github.raw'], { binary: true });
          fs.writeFileSync(fullPath, content);
          if (entry.mode === '100755') {
            fs.chmodSync(fullPath, 0o755);
          } else {
            fs.chmodSync(fullPath, 0o644);
          }
        }
      }
    }

    fileCount = lib.countLeafEntries(filtered);

    if (outputFormat === 'tarball') {
      execFileSync('tar', ['-czf', tarPath, '-C', treeDir, '--transform', 's|^\\./||', '.'], { stdio: 'inherit' });
      outputPath = tarPath;
    } else {
      outputPath = treeDir;
    }
  }

  writeOutput('output-path', outputPath);
  writeOutput('resolved-ref', resolvedRef);
  writeOutput('file-count', fileCount);

  process.exit(0);
}

// `gh api repos/.../git/ref/<heads|tags>/<name>` returns an OBJECT for
// an exact match and an ARRAY for a prefix match (e.g., `v1` matching
// `v1.0`, `v1.1`, ...). The array form is treated as "ref not found"
// for this action's purposes — we want exact-name lookups only.
function resolveExactRefObject(repo, namespace, name) {
  let raw;
  try {
    raw = gh(['api', `repos/${repo}/git/ref/${namespace}/${name}`]);
  } catch (e) {
    return null;
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return null; }
  if (Array.isArray(parsed)) return null;
  if (!parsed || !parsed.object) return null;
  return parsed;
}

function resolveRef(ref, repo) {
  // Try local git first (per spec acceptance #9 + Phase 3 review on
  // PR #165): a local clone may already have the object. Avoids an
  // API call when the consumer's checkout is sufficient.
  const local = gitLocal(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (local && /^[a-f0-9]{40}$/i.test(local)) {
    return local;
  }

  if (/^[a-f0-9]{40}$/i.test(ref)) {
    // Bare full SHA. Local git didn't have it; verify via API.
    try {
      const commitInfo = JSON.parse(gh(['api', `repos/${repo}/git/commits/${ref}`]));
      return commitInfo.sha;
    } catch (e) {
      fail(`ref not found: ${ref}`);
    }
  }

  if (/^[a-f0-9]{7,39}$/i.test(ref)) {
    try {
      const commitInfo = JSON.parse(gh(['api', `repos/${repo}/git/commits/${ref}`]));
      return commitInfo.sha;
    } catch (e) {
      fail(`ref not found: ${ref}`);
    }
  }

  if (ref.startsWith('refs/heads/')) {
    const branch = ref.slice('refs/heads/'.length);
    const refInfo = resolveExactRefObject(repo, 'heads', branch);
    if (!refInfo) fail(`ref not found: ${ref}`);
    return refInfo.object.sha;
  }

  if (ref.startsWith('refs/tags/')) {
    const tag = ref.slice('refs/tags/'.length);
    const refInfo = resolveExactRefObject(repo, 'tags', tag);
    if (!refInfo) fail(`ref not found: ${ref}`);
    if (refInfo.object.type === 'tag') {
      const tagObj = JSON.parse(gh(['api', `repos/${repo}/git/tags/${refInfo.object.sha}`]));
      return tagObj.object.sha;
    }
    return refInfo.object.sha;
  }

  // Bare name — try tags first (precedence rule, matches `git
  // rev-parse`'s default annotated-tag preference), then heads.
  const tagRef = resolveExactRefObject(repo, 'tags', ref);
  if (tagRef) {
    if (tagRef.object.type === 'tag') {
      const tagObj = JSON.parse(gh(['api', `repos/${repo}/git/tags/${tagRef.object.sha}`]));
      return tagObj.object.sha;
    }
    return tagRef.object.sha;
  }
  const headRef = resolveExactRefObject(repo, 'heads', ref);
  if (headRef) return headRef.object.sha;

  fail(`ref not found: ${ref}`);
}

console.error(`Unknown command: ${cmd}`);
process.exit(1);
