// Phase 2-3 (Red gate) and Phase 4-5 (Green gate) retry-loop driver.
// Replaces the two large bash retry-loop steps in
// promote-tech-to-pr/action.yml — one canonical TS implementation for
// both gates, sharing helpers (agent invocation, test execution, git
// commit/reset, bail-message formatting).
//
// CLI: deno run gates.ts <red|green>
//
// Reads from env (matching the action.yml step env block):
//   ANTHROPIC_API_KEY, GH_TOKEN, ISSUE_NUMBER, BRANCH, PR_NUMBER,
//   MAX_RETRIES, AGENT_TIMEOUT_SECONDS, DEFAULT_TEST_CMD (Red gate),
//   NO_RUNNER (Green gate), RUNNER_TEMP, GITHUB_OUTPUT.
//
// Writes outputs via GITHUB_OUTPUT:
//   - Red/Green: bailed=true|false; on bail, bail=<detail> (multiline via heredoc)
//   - Red also persists meta to ${RUNNER_TEMP}/phase2-meta-final.json
//     for the Green gate to read NEW_CMD/REG_CMD from.

import { Claude } from "../../../agents/claude.ts";
import { read as readPhase2 } from "../../phase-2/frontmatter.ts";
import * as output from "../../../github/output.ts";

import * as inputs from "../../../github/inputs.ts";
import * as shared from "../../../github/shared.ts";
import Mustache from "npm:mustache@^4";
// deno-lint-ignore no-explicit-any
const git = (await import("npm:simple-git@^3")).default as any;
const sg = git();

const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP") ?? "/tmp";
const BRANCH = inputs.get("branch") ?? "";
const ISSUE = inputs.get("issue-number") ?? "";
const MAX_RETRIES = Number(inputs.get("max-retries") ?? "3");
const TIMEOUT = Number(inputs.get("agent-timeout-seconds") ?? "900");

const HERE = new URL(".", import.meta.url);
const load = (name: string) => Deno.readTextFile(new URL(`./${name}`, HERE));
const RED_PROMPT = await load("red.prompt.md");
const GREEN_PROMPT = await load("green.prompt.md");
const GREEN_NORUN_PROMPT = await load("green-no-runner.prompt.md");
const REGRESSION_PROMPT = await load("regression.prompt.md");

// shell() is available from octoscript globals when run via octoscript.
// When imported as a module, we need our own.
async function run(cmd: string): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> {
  const proc = new Deno.Command("bash", {
    args: ["-c", cmd],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).bytes(),
  ]);
  const { code } = await proc.status;
  return { code, stdout, stderr };
}

/** Read tech-spec title + body from the shared module. */
async function techContext(): Promise<{ title: string; body: string }> {
  return {
    title: await shared.get("tech", "title") ?? "",
    body: await shared.get("tech", "body") ?? "",
  };
}



async function buildPhase2Input(): Promise<string> {
  const ctx = await techContext();
  const tmpl = await load("red.input.mustache");
  return Mustache.render(tmpl, {
    prompt: RED_PROMPT,
    cmd: inputs.get("default-test-cmd") ?? "",
    memory: await Deno.readTextFile("MEMORY.md"),
    title: ctx.title,
    body: ctx.body,
  });
}

/** Build the Phase 4 agent input as a string. `meta` is null on the
 *  no-runner path. Caller wraps in a Blob().stream() before passing
 *  to Claude. */
async function buildPhase4Input(
  meta: { "red-green": string; regression: string } | null,
): Promise<string> {
  const ctx = await techContext();
  const tmpl = await load("green.input.mustache");
  return Mustache.render(tmpl, {
    prompt: meta === null ? GREEN_NORUN_PROMPT : GREEN_PROMPT,
    memory: await Deno.readTextFile("MEMORY.md"),
    title: ctx.title,
    body: ctx.body,
    commands: meta ? { "red-green": meta["red-green"], regression: meta.regression } : null,
  });
}

// =========================================================================
// Red gate (Phases 2-3): author tests, expect new fail + reg pass.
// =========================================================================
export async function red(): Promise<void> {
  const claude = new Claude({ timeout: TIMEOUT });
  const ATTEMPTS = MAX_RETRIES + 1;
  let passed = false;
  let lastFailure = "";
  let metaFinalPath = "";
  let newResult = { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
  let regResult = { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`\n=== Phase 2 — Author tests (attempt ${attempt} of ${ATTEMPTS}) ===`);

    const body = await buildPhase2Input();
    const r = await claude.run(new Blob([body]).stream());
    if (r.rc !== 0) {
      lastFailure =
        `Phase 2 agent (attempt ${attempt}) exited non-zero on both primary and fallback models.`;
      console.error(`::warning::${lastFailure}`);
      continue;
    }

    let meta;
    try {
      const raw = new TextDecoder().decode(r.output);
      meta = readPhase2(raw);
    } catch (e) {
      lastFailure = `Phase 2 frontmatter parse failed (attempt ${attempt}): ${(e as Error).message}`;
      console.error(`::warning::${lastFailure}`);
      continue;
    }
    if (!meta || !meta.files.length || !meta["red-green"] || !meta.regression) {
      lastFailure =
        `Phase 2 declared empty files / red-green / regression (attempt ${attempt}). ` +
        `The agent did not produce a usable test set.`;
      console.error(`::warning::${lastFailure}`);
      continue;
    }

    console.log("Phase 2 declared new test files:\n" + meta.files.join("\n"));
    console.log(`Phase 2 new test command: ${meta["red-green"]}`);
    console.log(`Phase 2 regression test command: ${meta.regression}`);

    console.log(`\n=== Phase 3 — Red gate (attempt ${attempt}) ===`);
    const newResult = await run(meta["red-green"]);
    const regResult = await run(meta.regression);
    const newRc = newResult.code;
    const regRc = regResult.code;
    console.log(`  new tests exit: ${newRc} (expect non-zero)`);
    console.log(`  regression tests exit: ${regRc} (expect zero)`);

    if (newRc !== 0 && regRc === 0) {
      console.log("✓ Red gate passed.");
      passed = true;
      await commitPush(`test(promote): Phase 2 — author tests for #${ISSUE}`);
      // Persist meta for the Green gate.
      metaFinalPath = `${RUNNER_TEMP}/phase2-meta-final.json`;
      await Deno.writeTextFile(metaFinalPath, JSON.stringify(meta));
      break;
    }

    if (newRc === 0) {
      lastFailure =
        `Red gate FAIL: new tests passed before implementation (likely tautological tests). ` +
        `attempt ${attempt} of ${ATTEMPTS}.`;
    } else {
      lastFailure =
        `Red gate FAIL: regression tests broken by Phase 2 changes. attempt ${attempt} of ${ATTEMPTS}.`;
    }
    console.error(`::warning::${lastFailure}`);
    // Reset working tree before retry.
    await sg.checkout(["--", "."]);
    await sg.clean("f", ["-d"]);
  }

  if (!passed) {
    console.error(`::error::Red gate exhausted retries. Last failure: ${lastFailure}`);
    const bail = [
      lastFailure,
      "",
      "Last new-tests output:",
      "```",
      new TextDecoder().decode(newResult.stdout).split("\n").slice(-100).join("\n"),
      "```",
      "",
      "Last regression-tests output:",
      "```",
      new TextDecoder().decode(regResult.stdout).split("\n").slice(-100).join("\n"),
      "```",
    ].join("\n");
    await output.set("bail", bail);
    await output.set("bailed", "true");
  } else {
    await output.set("bailed", "false");
  }
}

// =========================================================================
// Green gate (Phases 4-5): implement, expect new pass + reg pass.
// =========================================================================
export async function green(): Promise<void> {
  const claude = new Claude({ timeout: TIMEOUT });
  const noRunner = Deno.env.get("NO_RUNNER") === "true";

  let meta: { "red-green": string; regression: string } | null = null;
  let ATTEMPTS = 1;
  if (!noRunner) {
    const j = JSON.parse(await Deno.readTextFile(`${RUNNER_TEMP}/phase2-meta-final.json`));
    meta = { "red-green": String(j["red-green"]), regression: String(j.regression) };
    ATTEMPTS = MAX_RETRIES + 1;
  }

  let passed = false;
  let lastFailure = "";
  let newResult = { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
  let regResult = { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`\n=== Phase 4 — Implement (attempt ${attempt} of ${ATTEMPTS}) ===`);

    const body = await buildPhase4Input(meta);
    const r = await claude.run(new Blob([body]).stream());
    if (r.rc !== 0) {
      lastFailure =
        `Phase 4 agent (attempt ${attempt}) exited non-zero on both primary and fallback models.`;
      console.error(`::warning::${lastFailure}`);
      await sg.checkout(["--", "."]);
      await sg.clean("f", ["-d"]);
      continue;
    }

    if (noRunner) {
      console.log("No test runner — committing Phase 4 changes as final.");
      const committed = await commitPush(`feat(promote): Phase 4 implementation for #${ISSUE}`);
      if (!committed) {
        lastFailure = "Phase 4 produced no changes (no-runner path).";
        console.error(`::warning::${lastFailure}`);
      } else {
        passed = true;
      }
      break;
    }

    console.log(`\n=== Phase 5 — Green gate (attempt ${attempt}) ===`);
    const newResult = await run(meta!["red-green"]);
    const regResult = await run(meta!.regression);
    const newRc = newResult.code;
    const regRc = regResult.code;
    console.log(`  new tests exit: ${newRc} (expect zero)`);
    console.log(`  regression tests exit: ${regRc} (expect zero)`);

    if (newRc === 0 && regRc === 0) {
      console.log("✓ Green gate passed.");
      passed = true;
      await commitPush(`feat(promote): Phase 4 implementation for #${ISSUE}`);
      break;
    }

    if (newRc !== 0) {
      lastFailure =
        `Green gate FAIL: new tests still failing — implementation incomplete. ` +
        `attempt ${attempt} of ${ATTEMPTS}.`;
    } else {
      lastFailure =
        `Green gate FAIL: regression broken by implementation. attempt ${attempt} of ${ATTEMPTS}.`;
    }
    console.error(`::warning::${lastFailure}`);
    // Discard the bad Phase 4 attempt; keep the committed Phase 2 tests.
    await sg.stash(["--include-untracked"]);
    try { await sg.stash(["drop"]); } catch {}
  }

  if (!passed) {
    console.error(`::error::Green gate exhausted retries. Last failure: ${lastFailure}`);
    const lines = [lastFailure, ""];
    if (!noRunner) {
      lines.push("Last new-tests output:", "```", new TextDecoder().decode(newResult.stdout).split("\n").slice(-100).join("\n"), "```", "");
      lines.push("Last regression-tests output:", "```", new TextDecoder().decode(regResult.stdout).split("\n").slice(-100).join("\n"), "```");
    }
    await output.set("bail", lines.join("\n"));
    await output.set("bailed", "true");
  } else {
    await output.set("bailed", "false");
  }
}


// =========================================================================
// Regression gate: author regression tests, expect pass.
// =========================================================================
export async function regression(): Promise<void> {
  const claude = new Claude({ timeout: TIMEOUT });
  const ATTEMPTS = MAX_RETRIES + 1;
  let passed = false;
  let lastFailure = "";
  let regRun = { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`\n=== Regression — Author regression tests (attempt ${attempt} of ${ATTEMPTS}) ===`);

    const ctx = await techContext();
    const memory = await Deno.readTextFile("MEMORY.md");
    const body = [
      REGRESSION_PROMPT,
      "--- MEMORY.md ---",
      memory,
      "",
      "--- TECH-SPEC ISSUE TITLE ---",
      ctx.title,
      "",
      "--- TECH-SPEC ISSUE BODY ---",
      ctx.body,
    ].join("\n");

    const r = await claude.run(new Blob([body]).stream());
    if (r.rc !== 0) {
      lastFailure = `Regression agent (attempt ${attempt}) exited non-zero on both primary and fallback.`;
      console.error(`::warning::${lastFailure}`);
      continue;
    }

    const raw = new TextDecoder().decode(r.output);
    // Parse the regression frontmatter block
    let meta: { files: string[]; command: string } | null = null;
    for (const block of (await import("../../frontmatter.ts")).parse(raw)) {
      if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
      const ns = (block as Record<string, unknown>).vsdd;
      if (typeof ns !== "object" || ns === null || Array.isArray(ns)) continue;
      const inner = (ns as Record<string, unknown>).regression;
      if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
      const files = (inner as Record<string, unknown>).files;
      const command = (inner as Record<string, unknown>).command;
      if (Array.isArray(files) && typeof command === "string") {
        meta = { files: files as string[], command };
      }
    }

    if (!meta || !meta.command) {
      if (meta && meta.files.length === 0) {
        console.log("No blast radius — regression gate skipped.");
        passed = true;
        break;
      }
      lastFailure = `Regression frontmatter parse failed (attempt ${attempt}).`;
      console.error(`::warning::${lastFailure}`);
      continue;
    }

    console.log(`Regression test files: ${meta.files.join(", ")}`);
    console.log(`Regression command: ${meta.command}`);

    console.log(`\n=== Regression — Run (attempt ${attempt}) ===`);
    const regRun = await run(meta.command);
    const rc = regRun.code;
    console.log(`  regression exit: ${rc} (expect zero)`);

    if (rc === 0) {
      console.log("✓ Regression gate passed.");
      passed = true;
      await commitPush(`test(promote): regression tests for #${ISSUE}`);
      break;
    }

    lastFailure = `Regression gate FAIL: regression tests failed — change broke existing behavior. attempt ${attempt} of ${ATTEMPTS}.`;
    console.error(`::warning::${lastFailure}`);
    await sg.checkout(["--", "."]);
    await sg.clean("f", ["-d"]);
  }

  if (!passed) {
    console.error(`::error::Regression gate exhausted retries. Last failure: ${lastFailure}`);
    const bail = [
      lastFailure,
      "",
      "Last regression output:",
      "```",
      new TextDecoder().decode(regRun.stdout).split("\n").slice(-100).join("\n"),
      "```",
    ].join("\n");
    await output.set("bail", bail);
    await output.set("bailed", "true");
  } else {
    await output.set("bailed", "false");
  }
}

if (import.meta.main) {
  const which = Deno.args[0];
  if (which === "red") await red();
  else if (which === "green") await green();
  else if (which === "regression") await regression();
  else {
    console.error("usage: gates.ts <red|green>");
    Deno.exit(2);
  }
}

/** Stage everything, commit (if there are staged changes) with `msg`,
 *  then push. Returns true iff a commit was made. */
async function commitPush(msg: string): Promise<boolean> {
  await sg.add(".");
  const status = await sg.status();
  if (status.isClean()) return false;
  await sg.commit(msg);
  await sg.push("origin", BRANCH);
  return true;
}
