export default async function(raw: string, _parsed: unknown): Promise<{ pass: boolean; error?: string }> {
  const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP") ?? "/tmp";
  const noRunner = Deno.env.get("NO_RUNNER") === "true";

  if (noRunner) {
    // No test runner — just commit
    const ISSUE = inputs.get("issue-number") ?? "";
    const BRANCH = inputs.get("branch") ?? "";
    const sg = git();
    await sg.add(".");
    const status = await sg.status();
    if (status.isClean()) {
      return { pass: false, error: "Phase 4 produced no changes (no-runner path)" };
    }
    await sg.commit("feat(promote): Phase 4 implementation for #" + ISSUE);
    await sg.push("origin", BRANCH);
    return { pass: true };
  }

  const j = JSON.parse(await Deno.readTextFile(RUNNER_TEMP + "/phase2-meta-final.json"));
  const newResult = await shell(j["red-green"]);
  const regResult = await shell(j.regression);
  console.log("  new tests exit: " + newResult.code + " (expect zero)");
  console.log("  regression tests exit: " + regResult.code + " (expect zero)");

  if (newResult.code === 0 && regResult.code === 0) {
    const ISSUE = inputs.get("issue-number") ?? "";
    const BRANCH = inputs.get("branch") ?? "";
    const sg = git();
    await sg.add(".");
    const status = await sg.status();
    if (!status.isClean()) {
      await sg.commit("feat(promote): Phase 4 implementation for #" + ISSUE);
      await sg.push("origin", BRANCH);
    }
    return { pass: true };
  }

  if (newResult.code !== 0) {
    return { pass: false, error: "New tests still failing — implementation incomplete" };
  }
  return { pass: false, error: "Regression broken by implementation" };
}
