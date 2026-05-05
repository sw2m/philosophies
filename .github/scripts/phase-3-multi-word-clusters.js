// Phase 3 multi-word symbol clustering: parse, validate, count, rewrite.
// Pure module (no I/O). Spec: sw2m/philosophies#183. Goal: sw2m/philosophies#167.

function parseClusters(body) {
  const match = body.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) {
    return { clusters: [], parseError: 'no yaml fenced block found' };
  }

  const yaml = match[1];
  const lines = yaml.split('\n');
  const clusters = [];
  let current = null;
  let inSymbols = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('- id:')) {
      if (current) clusters.push(current);
      current = {
        id: trimmed.slice(5).trim(),
        justification: '',
        symbols: [],
      };
      inSymbols = false;
    } else if (current && trimmed.startsWith('justification:')) {
      current.justification = trimmed.slice(14).trim();
    } else if (current && trimmed === 'symbols:') {
      inSymbols = true;
    } else if (current && inSymbols && trimmed.startsWith('- {')) {
      const symMatch = trimmed.match(
        /- \{file:\s*([^,]+),\s*line:\s*(\d+),\s*name:\s*([^}]+)\}/,
      );
      if (symMatch) {
        current.symbols.push({
          file: symMatch[1].trim(),
          line: parseInt(symMatch[2], 10),
          name: symMatch[3].trim(),
        });
      }
    }
  }
  if (current) clusters.push(current);

  if (clusters.length === 0) {
    return { clusters: [], parseError: 'yaml block contained no clusters' };
  }

  return { clusters, parseError: null };
}

function validateClusters({ clusters }) {
  const rejected = new Set();
  const reasons = {};

  const catchAllPr = /all multi.?word .* in (this )?(PR|file|repo|diff|commit)/i;
  const vaguePat = /^(verbose|bad|inconsistent|messy|unclear)\s*(names?|naming)?\s*\.?$/i;
  const singleChangePat = /single change:\s+\S+(\s+\S+){4,}/;

  for (const c of clusters) {
    if (catchAllPr.test(c.justification)) {
      rejected.add(c.id);
      reasons[c.id] = 'catch-all-by-PR';
      continue;
    }

    if (c.justification.length < 40 || vaguePat.test(c.justification)) {
      rejected.add(c.id);
      reasons[c.id] = 'vague justification';
      continue;
    }

    if (c.symbols.length === 0) {
      rejected.add(c.id);
      reasons[c.id] = 'empty cluster';
      continue;
    }

    if (c.symbols.length > 8) {
      if (!singleChangePat.test(c.justification)) {
        rejected.add(c.id);
        reasons[c.id] = 'oversized without single-change sentinel';
        continue;
      }
      const afterSentinel = c.justification
        .replace(/.*single change:\s*/i, '')
        .trim();
      if (afterSentinel.length < 30) {
        rejected.add(c.id);
        reasons[c.id] = 'trivial single-change bypass';
        continue;
      }
    }
  }

  return { rejected, reasons };
}

function clusterCount(parsed, validated) {
  let total = 0;
  for (const c of parsed.clusters) {
    if (validated.rejected.has(c.id)) {
      total += c.symbols.length;
    } else {
      total += 1;
    }
  }
  return total;
}

function extractFlatSymbolsFromFailedParse(body) {
  const fileLine = /\b([A-Za-z0-9_./-]+):(\d+)\b/g;
  const backtick = /`([a-zA-Z_$][a-zA-Z0-9_$]*)`/g;

  const symbols = new Set();
  let m;

  while ((m = fileLine.exec(body)) !== null) {
    symbols.add(`${m[1]}:${m[2]}`);
  }

  while ((m = backtick.exec(body)) !== null) {
    symbols.add(m[1]);
  }

  return [...symbols];
}

function rewriteCommentWithClusterCount(body, count) {
  const marker = '<!-- vsdd-cluster-count -->';
  const line = `${marker}\n**Multi-word cluster count:** ${count}\n`;

  if (body.includes(marker)) {
    return body.replace(
      /<!-- vsdd-cluster-count -->\n\*\*Multi-word cluster count:\*\* \d+\n/,
      line,
    );
  }

  return body + '\n' + line;
}

function reproducible(g, c, budget) {
  return g <= budget === c <= budget;
}

module.exports = {
  parseClusters,
  validateClusters,
  clusterCount,
  extractFlatSymbolsFromFailedParse,
  rewriteCommentWithClusterCount,
  reproducible,
};
