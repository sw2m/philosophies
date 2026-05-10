import { read as readPhase2 } from "../../phase-2/frontmatter.ts";

export default async function(raw: string, _parsed: unknown): Promise<{ pass: boolean; error?: string }> {
  let meta;
  try {
    meta = readPhase2(raw);
  } catch (e) {
    return { pass: false, error: "Frontmatter parse failed: " + (e as Error).message };
  }
  if (!meta || !meta.files.length || !meta["red-green"] || !meta.regression) {
    return { pass: false, error: "Agent declared empty files / red-green / regression" };
  }

  console.log("Phase 2 declared new test files:\n" + meta.files.join("\n"));
  console.log("Phase 2 new test command: " + meta["red-green"]);
  console.log("Phase 2 regression test command: " + meta.regression);

  const newResult = await shell(meta["red-green"]);
  const regResult = await shell(meta.regression);
  console.log("  new tests exit: " + newResult.code + " (expect non-zero)");
  console.log("  regression tests exit: " + regResult.code + " (expect zero)");

  if (newResult.code !== 0 && regResult.code === 0) {
    // Pass — persist meta for green gate
    const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP") ?? "/tmp";
    await Deno.writeTextFile(RUNNER_TEMP + "/phase2-meta-final.json", JSON.stringify(meta));
    const ISSUE = inputs.get("issue-number") ?? "";
    const BRANCH = inputs.get("branch") ?? "";
    const sg = git();
    await sg.add(".");
    const status = await sg.status();
    if (!status.isClean()) {
      await sg.commit("test(promote): Phase 2 — author tests for #" + ISSUE);
      await sg.push("origin", BRANCH);
    }
    return { pass: true };
  }

  if (newResult.code === 0) {
    return { pass: false, error: "New tests passed before implementation (likely tautological tests)" };
  }
  return { pass: false, error: "Regression tests broken by Phase 2 changes" };
}
