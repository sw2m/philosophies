import {
  Claude, output, sg,
  ISSUE, MAX_RETRIES, TIMEOUT, REGRESSION_PROMPT,
  run, techContext, commitPush,
} from "./helpers.ts";

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
