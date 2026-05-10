export default async function(raw: string, _parsed: unknown): Promise<{ pass: boolean; error?: string }> {
  const jsonMatch = raw.match(/\{[\s\S]*"files"[\s\S]*"command"[\s\S]*\}\s*$/);
  if (!jsonMatch) {
    return { pass: false, error: "No JSON metadata block found at end of output" };
  }

  let meta: { files: string[]; command: string };
  try {
    meta = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { pass: false, error: "JSON parse failed: " + (e as Error).message };
  }

  if (!meta.command) {
    if (meta.files.length === 0) {
      console.log("No blast radius — regression gate skipped.");
      return { pass: true };
    }
    return { pass: false, error: "Regression JSON missing command" };
  }

  console.log("Regression test files: " + meta.files.join(", "));
  console.log("Regression command: " + meta.command);

  const result = await shell(meta.command);
  console.log("  regression exit: " + result.code + " (expect zero)");

  if (result.code === 0) {
    const ISSUE = inputs.get("issue-number") ?? "";
    const BRANCH = inputs.get("branch") ?? "";
    const sg = git();
    await sg.add(".");
    const status = await sg.status();
    if (!status.isClean()) {
      await sg.commit("test(promote): regression tests for #" + ISSUE);
      await sg.push("origin", BRANCH);
    }
    return { pass: true };
  }
  return { pass: false, error: "Regression tests failed" };
}
