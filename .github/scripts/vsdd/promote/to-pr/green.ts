import {
  Claude, output, sg,
  RUNNER_TEMP, ISSUE, MAX_RETRIES, TIMEOUT,
  buildPhase4Input, commitPush,
} from "./helpers.ts";

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
    const newResult = await shell(meta!["red-green"]);
    const regResult = await shell(meta!.regression);
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
