// Pure dedup logic. The CLI wrappers (is-empty, render-input, parse-output,
// fallback-search, emit-outputs) thin-wrap these for the composite action's
// step boundaries. All side effects (stdin/stdout, $GITHUB_OUTPUT, gh
// invocation) live in the wrappers; this file is testable in isolation.

import { parse as parseYaml } from "jsr:@std/yaml@^1.0.5";

const TRUNCATE_DEFAULT = 4000;

// --- shared types ---------------------------------------------------------

export interface ProposedItem {
  id: string | number;
  title: string;
  body: string;
}

export interface ClosingPr {
  number: number;
  title: string;
  isDraft?: boolean;
}

export interface ExistingItem {
  number: number;
  title: string;
  body: string;
  state: string;
  stateReason?: string;
  closing_prs?: ClosingPr[];
}

export interface Verdict {
  proposed_id: string;
  duplicate_of: number | null;
  rationale: string;
  source: "agent" | "title-exact-fallback" | "empty-input";
}

export type DetectBypassResult =
  | { bypass: false }
  | { bypass: true; verdicts: Verdict[] };

export type ParseResult =
  | { ok: true; verdicts: Verdict[] }
  | { ok: false; reason: string };

// --- shared validators ----------------------------------------------------

export function validateProposed(items: unknown): asserts items is ProposedItem[] {
  if (!Array.isArray(items)) {
    throw new Error("proposed must be a JSON array");
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown> | null;
    if (!it || typeof it !== "object") {
      throw new Error(`proposed[${i}] must be an object`);
    }
    if (typeof it.title !== "string") {
      throw new Error(`proposed[${i}].title must be a string`);
    }
    if (typeof it.body !== "string") {
      throw new Error(`proposed[${i}].body must be a string`);
    }
    if (it.id === null || it.id === undefined) {
      throw new Error(`proposed[${i}].id is required`);
    }
  }
}

export function validateExisting(items: unknown): asserts items is ExistingItem[] {
  if (!Array.isArray(items)) {
    throw new Error("existing must be a JSON array");
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown> | null;
    if (!it || typeof it !== "object") {
      throw new Error(`existing[${i}] must be an object`);
    }
    if (typeof it.number !== "number") {
      throw new Error(`existing[${i}].number must be a number`);
    }
    if (typeof it.title !== "string") {
      throw new Error(`existing[${i}].title must be a string`);
    }
    if (typeof it.body !== "string") {
      throw new Error(`existing[${i}].body must be a string`);
    }
    if (typeof it.state !== "string") {
      throw new Error(`existing[${i}].state must be a string`);
    }
  }
}

// --- Step 0: detectBypass -------------------------------------------------

export function detectBypass(input: unknown): DetectBypassResult {
  if (!input || typeof input !== "object") {
    throw new Error("input must be an object with `proposed` and `existing` arrays");
  }
  const { proposed, existing } = input as { proposed: unknown; existing: unknown };
  validateProposed(proposed);
  validateExisting(existing);

  const bypass = proposed.length === 0 || existing.length === 0;
  if (!bypass) return { bypass: false };

  const verdicts: Verdict[] = proposed.map((p) => ({
    proposed_id: String(p.id),
    duplicate_of: null,
    rationale: "(empty input — no dedup performed)",
    source: "empty-input",
  }));
  return { bypass: true, verdicts };
}

// --- Step 1: renderPrompt -------------------------------------------------

function truncate(s: string | undefined | null, n = TRUNCATE_DEFAULT): string {
  s = (s ?? "").trim();
  return s.length <= n ? s : s.slice(0, n) + "\n... [truncated]";
}

export interface RenderResult {
  text: string;
  bytes: number;
}

export function renderPrompt(
  input: { proposed: ProposedItem[]; existing: ExistingItem[] },
  maxBytes?: number,
): RenderResult {
  validateProposed(input.proposed);
  validateExisting(input.existing);
  const { proposed, existing } = input;

  const lines: string[] = [];
  lines.push("# CRITICAL OUTPUT FORMAT (read FIRST)");
  lines.push("");
  lines.push("Your response MUST start with YAML frontmatter on the very first line — no preamble, no leading whitespace. Concrete shape:");
  lines.push("");
  lines.push("```");
  lines.push("---");
  lines.push("verdicts:");
  lines.push("  - proposed_index: 0");
  lines.push("    duplicate_of: 42  # existing issue number, OR null if no semantic match");
  lines.push("    rationale: |");
  lines.push("      one short line explaining the call");
  lines.push("  - proposed_index: 1");
  lines.push("    duplicate_of: null");
  lines.push("    rationale: |");
  lines.push("      ...");
  lines.push("---");
  lines.push("```");
  lines.push("");
  lines.push("# TASK");
  lines.push("");
  lines.push("Deduplicate proposed CI gap issues against pre-existing tracked gaps in this repo. Two gaps are SEMANTIC DUPLICATES when they describe the same underlying CI gap — same root cause, same VSDD section, same observable symptom — even if their titles or wording differ. Match on substance, not title.");
  lines.push("");
  lines.push("Closed issues are still valid dedup candidates. The maintainer who closed an issue (with or without a linked PR) made a judgment that should not be re-litigated by re-flagging. The PRIMARY failure mode this is meant to catch: an issue closed without a PR (closed because it was deemed low-value, wontfix, or out of scope) gets re-flagged on the next meta-CI run because the gap technically still exists. That should be a duplicate.");
  lines.push("");
  lines.push("**In-flight PRs are a strong duplicate signal.** When an existing tracked issue has one or more open PRs declared as closing it (rendered below as a `<closing-prs>` sub-element on the `<issue>` block), that gap is actively being addressed. A proposed gap matching that issue is a duplicate — even if the existing issue's title differs in wording. Mention the PR number(s) in your `rationale` so the consensus comment can surface that the remediation is in flight.");
  lines.push("");
  lines.push("Match conservatively. Only call something a duplicate if you are confident the substance overlaps — when in doubt, return null and let the human decide.");
  lines.push("");
  lines.push("Output one verdict per proposed gap, in order. `proposed_index` is 0-based and must match the `<proposed index=N>` blocks below.");
  lines.push("");
  lines.push("--- EXISTING TRACKED GAPS ---");
  for (const e of existing) {
    lines.push("");
    lines.push(`<issue number="${e.number}" state="${e.state}" stateReason="${e.stateReason ?? ""}">`);
    lines.push(`<title>${e.title}</title>`);
    lines.push("<body>");
    lines.push(truncate(e.body));
    lines.push("</body>");
    for (const pr of (e.closing_prs ?? [])) {
      const draft = pr.isDraft ? ` isDraft="true"` : "";
      lines.push(`<closing-prs><pr number="${pr.number}"${draft}>${pr.title}</pr></closing-prs>`);
    }
    lines.push("</issue>");
  }
  lines.push("");
  lines.push("--- PROPOSED NEW GAPS ---");
  for (let i = 0; i < proposed.length; i++) {
    const p = proposed[i];
    lines.push("");
    lines.push(`<proposed index="${i}">`);
    lines.push(`<title>${p.title}</title>`);
    lines.push("<body>");
    lines.push(truncate(p.body));
    lines.push("</body>");
    lines.push("</proposed>");
  }

  const text = lines.join("\n");
  const bytes = new TextEncoder().encode(text).byteLength;
  if (typeof maxBytes === "number" && bytes > maxBytes) {
    throw new Error(`rendered prompt is ${bytes} bytes, exceeds max-bytes ${maxBytes}`);
  }
  return { text, bytes };
}

// --- Step 3: parseAgentOutput ---------------------------------------------

const FRONTMATTER_TOP = /^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
const FRONTMATTER_EMBEDDED = /\n---\s*\n(verdicts\s*:[\s\S]*?)\n---\s*\n/;

function tryParseFrontmatter(raw: string): { verdicts: unknown[] } | null {
  let m = raw.match(FRONTMATTER_TOP);
  if (m) {
    try {
      const fm = parseYaml(m[1]) as Record<string, unknown> | null;
      if (fm && typeof fm === "object" && Array.isArray(fm.verdicts)) {
        return fm as { verdicts: unknown[] };
      }
    } catch { /* fall through */ }
  }
  m = raw.match(FRONTMATTER_EMBEDDED);
  if (m) {
    try {
      const fm = parseYaml(m[1]) as Record<string, unknown> | null;
      if (fm && typeof fm === "object" && Array.isArray(fm.verdicts)) {
        return fm as { verdicts: unknown[] };
      }
    } catch { /* fall through */ }
  }
  return null;
}

export function parseAgentOutput(
  rawText: string,
  proposed: ProposedItem[],
  existingNumbers: Set<number> | number[],
): ParseResult {
  validateProposed(proposed);
  const existing: Set<number> = existingNumbers instanceof Set
    ? existingNumbers
    : new Set(existingNumbers);

  const fm = tryParseFrontmatter(rawText);
  if (!fm) return { ok: false, reason: "no parseable frontmatter with verdicts: list" };

  const dupMap = new Map<number, number>();
  const rationaleMap = new Map<number, string>();
  for (const raw of fm.verdicts) {
    const v = raw as Record<string, unknown> | null;
    if (!v || typeof v !== "object") continue;
    const idx = v.proposed_index;
    const dup = v.duplicate_of;
    if (typeof idx !== "number" || idx < 0 || idx >= proposed.length) continue;
    if (dup === null || dup === undefined) {
      if (typeof v.rationale === "string") rationaleMap.set(idx, v.rationale);
      continue;
    }
    if (typeof dup !== "number") {
      return { ok: false, reason: `verdict[${idx}].duplicate_of must be number or null` };
    }
    if (!existing.has(dup)) {
      return { ok: false, reason: `verdict[${idx}].duplicate_of=${dup} not in existing set` };
    }
    if (dupMap.has(idx)) {
      return { ok: false, reason: `verdict[${idx}] specified more than once` };
    }
    dupMap.set(idx, dup);
    if (typeof v.rationale === "string") rationaleMap.set(idx, v.rationale);
  }

  const verdicts: Verdict[] = proposed.map((p, i) => ({
    proposed_id: String(p.id),
    duplicate_of: dupMap.has(i) ? dupMap.get(i)! : null,
    rationale: rationaleMap.get(i) ?? "",
    source: "agent",
  }));
  return { ok: true, verdicts };
}

// Step 4 (title-exact fallback) lives inline in action.yml as a
// github-deno script (#196) — Octokit + a small in-memory title-equality
// match. Keeping the projection logic out of this file avoids needing the
// inline script to import a file outside its tempfile directory.

// --- Step 5: composeOutput ------------------------------------------------

export interface ComposeInputs {
  bypassResult: DetectBypassResult | null;
  parseResult: ParseResult | null;
  fallbackResult: Verdict[] | null;
}

export function composeOutput(
  { bypassResult, parseResult, fallbackResult }: ComposeInputs,
): { verdicts: Verdict[]; source: string } {
  if (bypassResult && bypassResult.bypass) {
    return { verdicts: bypassResult.verdicts, source: "empty-input" };
  }
  if (parseResult && parseResult.ok) {
    return { verdicts: parseResult.verdicts, source: "agent" };
  }
  if (Array.isArray(fallbackResult)) {
    return { verdicts: fallbackResult, source: "title-exact-fallback" };
  }
  throw new Error("composeOutput: no source produced verdicts");
}
