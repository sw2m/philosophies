import {
  Claude, readPhase2, output, sg,
  RUNNER_TEMP, ISSUE, MAX_RETRIES, TIMEOUT,
  buildPhase2Input, commitPush,
} from "./helpers.ts";

export async function red(): Promise<void> {
  const claude = new Claude({ timeout: TIMEOUT });
  const ATTEMPTS = MAX_RETRIES + 1;
  let passed = false;
  let lastFailure = "";
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
    const newResult = await shell(meta["red-green"]);
    const regResult = await shell(meta.regression);
    const newRc = newResult.code;
    const regRc = regResult.code;
    console.log(`  new tests exit: ${newRc} (expect non-zero)`);
    console.log(`  regression tests exit: ${regRc} (expect zero)`);

    if (newRc !== 0 && regRc === 0) {
      console.log("✓ Red gate passed.");
      passed = true;
      await commitPush(`test(promote): Phase 2 — author tests for #${ISSUE}`);
      const metaFinalPath = `${RUNNER_TEMP}/phase2-meta-final.json`;
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
