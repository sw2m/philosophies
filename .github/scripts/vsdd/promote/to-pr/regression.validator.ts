export default async function(raw: string, _parsed: unknown): Promise<{ pass: boolean; error?: string }> {
  const blocks = serde.parse(raw, "frontmatter");
  let meta: { files: string[]; command: string } | null = null;
  for (const block of (blocks as unknown[])) {
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
      return { pass: true };
    }
    return { pass: false, error: "Regression frontmatter parse failed" };
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
