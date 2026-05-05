// Unit tests for the pure dedup logic in lib.ts. Uses Deno.test (built-in).

import { assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  composeOutput,
  detectBypass,
  extractMatches,
  parseAgentOutput,
  renderPrompt,
  validateExisting,
  validateProposed,
  type ExistingItem,
  type ProposedItem,
} from "./lib.ts";

const sampleProposed: ProposedItem[] = [
  { id: "a", title: "CI broken on main", body: "fails on master push" },
  { id: "b", title: "Docs typo", body: "README missing comma" },
];
const sampleExisting: ExistingItem[] = [
  { number: 42, title: "CI on main is red", body: "related", state: "OPEN" },
  { number: 43, title: "Some other thing", body: "unrelated", state: "CLOSED" },
];

// --- validators -----------------------------------------------------------

Deno.test("validateProposed accepts well-formed", () => {
  validateProposed(sampleProposed);
});
Deno.test("validateProposed rejects non-array", () => {
  assertThrows(() => validateProposed({}), Error, "must be a JSON array");
});
Deno.test("validateProposed rejects missing id", () => {
  assertThrows(
    () => validateProposed([{ title: "t", body: "b" }]),
    Error,
    "id is required",
  );
});
Deno.test("validateProposed rejects non-string title", () => {
  assertThrows(
    () => validateProposed([{ id: "x", title: 1, body: "b" }]),
    Error,
    "title must be a string",
  );
});
Deno.test("validateExisting rejects missing number", () => {
  assertThrows(
    () => validateExisting([{ title: "t", body: "b", state: "OPEN" }]),
    Error,
    "number must be a number",
  );
});

// --- detectBypass ---------------------------------------------------------

Deno.test("detectBypass: bypass=false on both non-empty", () => {
  const r = detectBypass({ proposed: sampleProposed, existing: sampleExisting });
  assertEquals(r.bypass, false);
});

Deno.test("detectBypass: empty proposed → bypass with empty verdicts", () => {
  const r = detectBypass({ proposed: [], existing: sampleExisting });
  if (!r.bypass) throw new Error("expected bypass");
  assertEquals(r.verdicts, []);
});

Deno.test("detectBypass: empty existing → bypass with all-null verdicts parallel to proposed", () => {
  const r = detectBypass({ proposed: sampleProposed, existing: [] });
  if (!r.bypass) throw new Error("expected bypass");
  assertEquals(r.verdicts.length, 2);
  for (const v of r.verdicts) {
    assertEquals(v.duplicate_of, null);
    assertEquals(v.source, "empty-input");
  }
  assertEquals(r.verdicts[0].proposed_id, "a");
  assertEquals(r.verdicts[1].proposed_id, "b");
});

Deno.test("detectBypass: malformed input throws", () => {
  assertThrows(() => detectBypass(null), Error, "must be an object");
  assertThrows(
    () => detectBypass({ proposed: "not array" }),
    Error,
    "must be a JSON array",
  );
});

// --- renderPrompt ---------------------------------------------------------

Deno.test("renderPrompt: includes every existing number, title, and proposed title", () => {
  const { text, bytes } = renderPrompt({ proposed: sampleProposed, existing: sampleExisting });
  if (!text.includes('number="42"')) throw new Error("existing #42 missing");
  if (!text.includes("CI on main is red")) throw new Error("existing title missing");
  if (!text.includes('number="43"')) throw new Error("existing #43 missing");
  if (!text.includes("CI broken on main")) throw new Error("proposed title missing");
  if (!text.includes("Docs typo")) throw new Error("proposed title missing");
  if (!text.includes('<proposed index="0">')) throw new Error("index=0 missing");
  if (!text.includes('<proposed index="1">')) throw new Error("index=1 missing");
  assertEquals(bytes, new TextEncoder().encode(text).byteLength);
});

Deno.test("renderPrompt: closing_prs rendered as sub-element", () => {
  const existing: ExistingItem[] = [{
    ...sampleExisting[0],
    closing_prs: [{ number: 99, title: "Fix CI", isDraft: false }],
  }];
  const { text } = renderPrompt({ proposed: sampleProposed, existing });
  if (!text.includes('<closing-prs><pr number="99">Fix CI</pr></closing-prs>')) {
    throw new Error("closing-prs sub-element missing");
  }
});

Deno.test("renderPrompt: throws when over max-bytes", () => {
  assertThrows(
    () => renderPrompt({ proposed: sampleProposed, existing: sampleExisting }, 100),
    Error,
    "exceeds max-bytes 100",
  );
});

Deno.test("renderPrompt: under max-bytes returns normally", () => {
  const { bytes } = renderPrompt({ proposed: sampleProposed, existing: sampleExisting }, 1_000_000);
  if (!(bytes > 0)) throw new Error("expected bytes > 0");
});

// --- parseAgentOutput -----------------------------------------------------

const goodOutput = [
  "---",
  "verdicts:",
  "  - proposed_index: 0",
  "    duplicate_of: 42",
  "    rationale: |",
  "      same root cause as #42",
  "  - proposed_index: 1",
  "    duplicate_of: null",
  "    rationale: |",
  "      novel issue",
  "---",
  "",
  "(prose follows)",
].join("\n");

Deno.test("parseAgentOutput: good top frontmatter", () => {
  const r = parseAgentOutput(goodOutput, sampleProposed, new Set([42, 43]));
  if (!r.ok) throw new Error("expected ok");
  assertEquals(r.verdicts.length, 2);
  assertEquals(r.verdicts[0].duplicate_of, 42);
  assertEquals(r.verdicts[0].rationale.trim(), "same root cause as #42");
  assertEquals(r.verdicts[1].duplicate_of, null);
  assertEquals(r.verdicts[0].source, "agent");
});

Deno.test("parseAgentOutput: embedded frontmatter (preamble before)", () => {
  const wrapped = "leading prose\n\n" + goodOutput;
  const r = parseAgentOutput(wrapped, sampleProposed, new Set([42, 43]));
  if (!r.ok) throw new Error("expected ok");
  assertEquals(r.verdicts[0].duplicate_of, 42);
});

Deno.test("parseAgentOutput: missing frontmatter → ok:false", () => {
  const r = parseAgentOutput("just prose, no yaml", sampleProposed, new Set([42]));
  if (r.ok) throw new Error("expected !ok");
  assertMatch(r.reason, /no parseable frontmatter/);
});

Deno.test("parseAgentOutput: referential-integrity failure → ok:false", () => {
  const bad = goodOutput.replace("duplicate_of: 42", "duplicate_of: 999");
  const r = parseAgentOutput(bad, sampleProposed, new Set([42, 43]));
  if (r.ok) throw new Error("expected !ok");
  assertMatch(r.reason, /999 not in existing set/);
});

Deno.test("parseAgentOutput: multi-match → ok:false", () => {
  const dup = goodOutput.replace(
    "  - proposed_index: 1\n    duplicate_of: null",
    "  - proposed_index: 0\n    duplicate_of: 43",
  );
  const r = parseAgentOutput(dup, sampleProposed, new Set([42, 43]));
  if (r.ok) throw new Error("expected !ok");
  assertMatch(r.reason, /specified more than once/);
});

// --- extractMatches -------------------------------------------------------

Deno.test("extractMatches: title-exact match populates duplicate_of", () => {
  const ghResp = [
    { number: 100, title: "CI broken on main" },
    { number: 200, title: "unrelated" },
  ];
  const r = extractMatches(sampleProposed, ghResp);
  assertEquals(r.length, 2);
  assertEquals(r[0].duplicate_of, 100);
  assertEquals(r[0].source, "title-exact-fallback");
  assertEquals(r[1].duplicate_of, null);
});

Deno.test("extractMatches: empty gh response → all null", () => {
  const r = extractMatches(sampleProposed, []);
  if (!r.every((v) => v.duplicate_of === null)) {
    throw new Error("expected all duplicate_of=null");
  }
});

Deno.test("extractMatches: first match wins on duplicate titles", () => {
  const ghResp = [
    { number: 100, title: "CI broken on main" },
    { number: 101, title: "CI broken on main" },
  ];
  const r = extractMatches(sampleProposed, ghResp);
  assertEquals(r[0].duplicate_of, 100);
});

// --- composeOutput --------------------------------------------------------

Deno.test("composeOutput: bypass wins", () => {
  const bypassResult = {
    bypass: true as const,
    verdicts: [{
      proposed_id: "x",
      duplicate_of: null,
      rationale: "",
      source: "empty-input" as const,
    }],
  };
  const r = composeOutput({ bypassResult, parseResult: null, fallbackResult: null });
  assertEquals(r.source, "empty-input");
  assertEquals(r.verdicts.length, 1);
});

Deno.test("composeOutput: parse wins over fallback when ok", () => {
  const parseResult = {
    ok: true as const,
    verdicts: [{
      proposed_id: "a",
      duplicate_of: 42,
      rationale: "",
      source: "agent" as const,
    }],
  };
  const fallbackResult = [{
    proposed_id: "a",
    duplicate_of: null,
    rationale: "",
    source: "title-exact-fallback" as const,
  }];
  const r = composeOutput({ bypassResult: { bypass: false }, parseResult, fallbackResult });
  assertEquals(r.source, "agent");
});

Deno.test("composeOutput: fallback wins when parse not-ok", () => {
  const parseResult = { ok: false as const, reason: "unparseable" };
  const fallbackResult = [{
    proposed_id: "a",
    duplicate_of: 99,
    rationale: "",
    source: "title-exact-fallback" as const,
  }];
  const r = composeOutput({ bypassResult: { bypass: false }, parseResult, fallbackResult });
  assertEquals(r.source, "title-exact-fallback");
  assertEquals(r.verdicts[0].duplicate_of, 99);
});

Deno.test("composeOutput: throws when nothing produced verdicts", () => {
  assertThrows(
    () =>
      composeOutput({
        bypassResult: { bypass: false },
        parseResult: null,
        fallbackResult: null,
      }),
    Error,
    "no source produced verdicts",
  );
});
