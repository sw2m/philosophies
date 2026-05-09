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
//   - Red:   bailed=true|false; on bail, ${RUNNER_TEMP}/red-bail.md
//   - Green: bailed=true|false; on bail, ${RUNNER_TEMP}/green-bail.md
//   - Red also persists meta to ${RUNNER_TEMP}/phase2-meta-final.json
//     for the Green gate to read NEW_CMD/REG_CMD from.

import { Claude } from "../../../agents/claude.ts";
import { read as readPhase2 } from "../../phase-2/frontmatter.ts";
import * as output from "../../../github/output.ts";

const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP") ?? "/tmp";
const BRANCH = Deno.env.get("BRANCH")!;
const ISSUE = Deno.env.get("ISSUE_NUMBER")!;
const MAX_RETRIES = Number(Deno.env.get("MAX_RETRIES") ?? "3");
const TIMEOUT = Number(Deno.env.get("AGENT_TIMEOUT_SECONDS") ?? "900");

const HERE = new URL(".", import.meta.url);
const RED_PROMPT = await Deno.readTextFile(new URL("./red.prompt.md", HERE));
const GREEN_PROMPT = await Deno.readTextFile(new URL("./green.prompt.md", HERE));
const GREEN_NORUN_PROMPT = await Deno.readTextFile(
  new URL("./green-no-runner.prompt.md", HERE),
);

/** Run a shell command, sending stdout+stderr to `log`. Returns exit code. */
async function shell(cmd: string, log: string): Promise<number> {
  const proc = new Deno.Command("bash", {
    args: ["-c", `${cmd} > ${log} 2>&1`],
    stdout: "null",
    stderr: "null",
  }).spawn();
  return (await proc.status).code;
}

/** Run a git command with stdio inherited. Returns exit code. */
async function git(...args: string[]): Promise<number> {
  const proc = new Deno.Command("git", {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  return (await proc.status).code;
}

/** Stage everything, commit (if there are staged changes) with `msg`,
 *  then push the current `BRANCH`. Returns true iff a commit was made. */
async function commitPush(msg: string): Promise<boolean> {
  await git("add", ".");
  const cached = await new Deno.Command("git", {
    args: ["diff", "--cached", "--quiet"],
  }).output();
  if (cached.code === 0) return false; // nothing staged
  await git("commit", "-m", msg);
  await git("push", "origin", BRANCH);
  return true;
}

/** Read tech-spec title + body files written by an earlier action step. */
async function techContext(): Promise<{ title: string; body: string }> {
  return {
    title: await Deno.readTextFile(`${RUNNER_TEMP}/tech-title.txt`),
    body: await Deno.readTextFile(`${RUNNER_TEMP}/tech-body.txt`),
  };
}

/** Tail the last N lines of a file, returning the slice (best-effort). */
async function tail(path: string, n: number): Promise<string> {
  try {
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");
    return lines.slice(Math.max(0, lines.length - n)).join("\n");
  } catch {
    return "";
  }
}

/** Build the Phase 2 agent input as a string: prompt + DEFAULT_TEST_CMD +
 *  MEMORY.md + tech-spec title/body. Caller wraps in a Blob().stream()
 *  before passing to Claude. */
async function buildPhase2Input(): Promise<string> {
  const ctx = await techContext();
  const memory = await Deno.readTextFile("MEMORY.md");
  return [
    RED_PROMPT,
    `DEFAULT_TEST_CMD=${Deno.env.get("DEFAULT_TEST_CMD") ?? ""}`,
    "",
    "--- MEMORY.md ---",
    memory,
    "",
    "--- TECH-SPEC ISSUE TITLE ---",
    ctx.title,
    "",
    "--- TECH-SPEC ISSUE BODY ---",
    ctx.body,
  ].join("\n");
}

/** Build the Phase 4 agent input as a string. `meta` is null on the
 *  no-runner path. Caller wraps in a Blob().stream() before passing
 *  to Claude. */
async function buildPhase4Input(
  meta: { "red-green": string; regression: string } | null,
): Promise<string> {
  const ctx = await techContext();
  const memory = await Deno.readTextFile("MEMORY.md");
  const head = meta === null ? GREEN_NORUN_PROMPT : GREEN_PROMPT;
  const lines = [
    head,
    "--- MEMORY.md ---",
    memory,
    "",
    "--- TECH-SPEC ISSUE TITLE ---",
    ctx.title,
    "",
    "--- TECH-SPEC ISSUE BODY ---",
    ctx.body,
  ];
  if (meta !== null) {
    lines.push(
      "",
      "--- TEST RUN COMMANDS ---",
      `New tests command (must end up exit 0): ${meta["red-green"]}`,
      `Regression tests command (must end up exit 0): ${meta.regression}`,
    );
  }
  return lines.join("\n");
}

// =========================================================================
// Red gate (Phases 2-3): author tests, expect new fail + reg pass.
// =========================================================================
export async function redGate(): Promise<void> {
  const claude = new Claude({ timeout: TIMEOUT });
  const ATTEMPTS = MAX_RETRIES + 1;
  let passed = false;
  let lastFailure = "";
  let metaFinalPath = "";

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
    const newRc = await shell(meta["red-green"], `${RUNNER_TEMP}/red-new.log`);
    const regRc = await shell(meta.regression, `${RUNNER_TEMP}/red-reg.log`);
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
    await git("checkout", "--", ".");
    await git("clean", "-fd");
  }

  if (!passed) {
    console.error(`::error::Red gate exhausted retries. Last failure: ${lastFailure}`);
    const bail = [
      lastFailure,
      "",
      "Last new-tests output:",
      "```",
      await tail(`${RUNNER_TEMP}/red-new.log`, 100),
      "```",
      "",
      "Last regression-tests output:",
      "```",
      await tail(`${RUNNER_TEMP}/red-reg.log`, 100),
      "```",
    ].join("\n");
    await Deno.writeTextFile(`${RUNNER_TEMP}/red-bail.md`, bail);
    await output.set("bailed", "true");
  } else {
    await output.set("bailed", "false");
  }
}

// =========================================================================
// Green gate (Phases 4-5): implement, expect new pass + reg pass.
// =========================================================================
export async function greenGate(): Promise<void> {
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

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`\n=== Phase 4 — Implement (attempt ${attempt} of ${ATTEMPTS}) ===`);

    const body = await buildPhase4Input(meta);
    const r = await claude.run(new Blob([body]).stream());
    if (r.rc !== 0) {
      lastFailure =
        `Phase 4 agent (attempt ${attempt}) exited non-zero on both primary and fallback models.`;
      console.error(`::warning::${lastFailure}`);
      await git("checkout", "--", ".");
      await git("clean", "-fd");
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
    const newRc = await shell(meta!["red-green"], `${RUNNER_TEMP}/green-new.log`);
    const regRc = await shell(meta!.regression, `${RUNNER_TEMP}/green-reg.log`);
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
    await new Deno.Command("git", { args: ["stash", "--include-untracked"] }).output();
    await new Deno.Command("git", { args: ["stash", "drop"] }).output();
  }

  if (!passed) {
    console.error(`::error::Green gate exhausted retries. Last failure: ${lastFailure}`);
    const lines = [lastFailure, ""];
    if (!noRunner) {
      lines.push("Last new-tests output:", "```", await tail(`${RUNNER_TEMP}/green-new.log`, 100), "```", "");
      lines.push("Last regression-tests output:", "```", await tail(`${RUNNER_TEMP}/green-reg.log`, 100), "```");
    }
    await Deno.writeTextFile(`${RUNNER_TEMP}/green-bail.md`, lines.join("\n"));
    await output.set("bailed", "true");
  } else {
    await output.set("bailed", "false");
  }
}

if (import.meta.main) {
  const which = Deno.args[0];
  if (which === "red") await redGate();
  else if (which === "green") await greenGate();
  else {
    console.error("usage: gates.ts <red|green>");
    Deno.exit(2);
  }
}
