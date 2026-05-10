import * as inputs from "../../../github/inputs.ts";
import * as shared from "../../../github/shared.ts";

export { inputs, shared };
export { Claude } from "../../../agents/claude.ts";
export { read as readPhase2 } from "../../phase-2/frontmatter.ts";
export * as output from "../../../github/output.ts";

const sg = git();
export { sg };

export const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP") ?? "/tmp";
export const BRANCH = inputs.get("branch") ?? "";
export const ISSUE = inputs.get("issue-number") ?? "";
export const MAX_RETRIES = Number(inputs.get("max-retries") ?? "3");
export const TIMEOUT = Number(inputs.get("agent-timeout-seconds") ?? "900");

const HERE = new URL(".", import.meta.url);
const load = (name: string) => Deno.readTextFile(new URL(`./${name}`, HERE));

export const RED_PROMPT = await load("red.prompt.md");
export const GREEN_PROMPT = await load("green.prompt.md");
export const GREEN_NORUN_PROMPT = await load("green-no-runner.prompt.md");
export const REGRESSION_PROMPT = await load("regression.prompt.md");


export async function techContext(): Promise<{ title: string; body: string }> {
  return {
    title: await shared.get("tech", "title") ?? "",
    body: await shared.get("tech", "body") ?? "",
  };
}

export async function buildPhase2Input(): Promise<string> {
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

export async function buildPhase4Input(
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

export async function commitPush(msg: string): Promise<boolean> {
  await sg.add(".");
  const status = await sg.status();
  if (status.isClean()) return false;
  await sg.commit(msg);
  await sg.push("origin", BRANCH);
  return true;
}
