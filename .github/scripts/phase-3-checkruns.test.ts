// Deno-native test suite for phase-3-checkruns.ts. Run via `deno test`.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";
import {
  cancel,
  CATEGORIES,
  conclude,
  inapplicable,
  name,
  summary,
  title,
} from "./phase-3-checkruns.ts";

Deno.test("CATEGORIES has 6 slugs", () => {
  assertEquals(Object.keys(CATEGORIES).length, 6);
});

Deno.test("name() returns per-reviewer name with reviewer", () => {
  assertEquals(name("multi-word-symbols", "gemini"), "Phase 3 / Multi-word symbols (§IX) — gemini");
  assertEquals(name("multi-word-symbols", "claude"), "Phase 3 / Multi-word symbols (§IX) — claude");
});

Deno.test("name() returns per-category aggregate without reviewer", () => {
  assertEquals(name("error-structure", null), "Phase 3 / Error structure (§IX)");
  assertEquals(name("security-surface"), "Phase 3 / Security surface (§II)");
});

Deno.test("name() throws for unknown slug", () => {
  // deno-lint-ignore no-explicit-any
  assertThrows(() => name("unknown-slug" as any, "gemini"), Error, "Unknown category slug");
});

Deno.test("conclude() returns failure if gemini=fail", () => {
  assertEquals(conclude("fail", "pass"), "failure");
  assertEquals(conclude("fail", "fail"), "failure");
  assertEquals(conclude("fail", "pending"), "failure");
});

Deno.test("conclude() returns failure if claude=fail", () => {
  assertEquals(conclude("pass", "fail"), "failure");
  assertEquals(conclude("pending", "fail"), "failure");
});

Deno.test("conclude() returns action_required if gemini=pending", () => {
  assertEquals(conclude("pending", "pass"), "action_required");
  assertEquals(conclude("pending", "pending"), "action_required");
});

Deno.test("conclude() returns action_required if claude=pending", () => {
  assertEquals(conclude("pass", "pending"), "action_required");
});

Deno.test("conclude() returns success only if both pass", () => {
  assertEquals(conclude("pass", "pass"), "success");
});

Deno.test("conclude() returns action_required for unknown verdicts", () => {
  assertEquals(conclude("unknown", "pass"), "action_required");
  assertEquals(conclude("pass", "unknown"), "action_required");
  assertEquals(conclude("", ""), "action_required");
});

Deno.test("title() formats active title", () => {
  assertEquals(title(1, "pass"), "round 1: pass");
  assertEquals(title(2, "fail"), "round 2: fail");
  assertEquals(title(3, "pass (force-pass)"), "round 3: pass (force-pass)");
});

Deno.test("title() formats stale title with 8-char SHAs", () => {
  const t = title(1, "pass", {
    stale: true,
    terminal: "abc123def456789",
    head: "987654321fedcba",
  });
  assertEquals(t, "terminal-stated at abc123de; HEAD 98765432 not reviewed");
});

Deno.test("title() ignores stale opts if incomplete", () => {
  assertEquals(title(1, "pass", { stale: true }), "round 1: pass");
  assertEquals(title(1, "pass", { stale: true, terminal: "abc" }), "round 1: pass");
});

Deno.test("summary() returns body unchanged when not stale", () => {
  assertEquals(summary("some body"), "some body");
  assertEquals(summary("body", { stale: false }), "body");
});

Deno.test("summary() prepends stale annotation", () => {
  const s = summary("review content", { stale: true, terminal: "abc123def456" });
  assert(s.startsWith("Stale: this category terminal-stated at abc123de"));
  assert(s.includes("review content"));
});

Deno.test("cancel() invokes checks.update with cancelled conclusion", async () => {
  // deno-lint-ignore no-explicit-any
  let captured: any = null;
  const mock = {
    rest: {
      checks: {
        update: (opts: unknown) => {
          captured = opts;
          return Promise.resolve();
        },
      },
    },
  };
  const ctx = { repo: { owner: "o", repo: "r" } };
  await cancel(mock, ctx, 123, { round: 2 });
  assertEquals(captured.check_run_id, 123);
  assertEquals(captured.conclusion, "cancelled");
  assertEquals(captured.output.title, "round 2: cancelled mid-run");
});

Deno.test("inapplicable() creates check with correct title and conclusion", async () => {
  // deno-lint-ignore no-explicit-any
  let captured: any = null;
  const mock = {
    rest: {
      checks: {
        create: (opts: unknown) => {
          captured = opts;
          return Promise.resolve({ data: { id: 1 } });
        },
      },
    },
  };
  const ctx = { repo: { owner: "o", repo: "r" } };
  await inapplicable(mock, ctx, "spec-gaps", "abc123");
  assertEquals(captured.name, "Phase 3 / Spec gaps (§II)");
  assertEquals(captured.conclusion, "success");
  assertEquals(captured.output.title, "round 1: pass (inapplicable)");
});
