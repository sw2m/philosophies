// Bail handler for promote-tech-to-pr gate failures. Posts a
// mustache-rendered comment on both the issue and the PR, applies
// `needs-human` label, and fails the step.
//
// Usage (from github-deno script):
//   const bail = await import("./scripts/vsdd/promote/to-pr/bail.ts");
//   await bail.run({ github, core, gate: "red", ... });

import Mustache from "npm:mustache@^4";

const TEMPLATE = await Deno.readTextFile(new URL("./bail.mustache", import.meta.url));

export type Opts = {
  api: { rest: { issues: { createComment: Function; addLabels: Function } } };
  core: { setFailed: Function };
  gate: "red" | "green";
  issue: number;
  pr: number;
  owner: string;
  detail: string;
  repo: { owner: string; repo: string };
};

export async function run(opts: Opts): Promise<void> {
  const body = Mustache.render(TEMPLATE, {
    gate: opts.gate === "red" ? "Red" : "Green",
    phase: opts.gate === "red" ? "3" : "5",
    red: opts.gate === "red",
    green: opts.gate === "green",
    detail: opts.detail,
    owner: opts.owner,
    pr: opts.pr,
  });

  // Label + comment on issue
  await (opts.api.rest.issues.addLabels as Function)({
    ...opts.repo,
    issue_number: opts.issue,
    labels: ["needs-human"],
  }).catch(() => {});

  await (opts.api.rest.issues.createComment as Function)({
    ...opts.repo,
    issue_number: opts.issue,
    body,
  });

  // Comment on PR
  await (opts.api.rest.issues.createComment as Function)({
    ...opts.repo,
    issue_number: opts.pr,
    body,
  });

  (opts.core.setFailed as Function)(`${opts.gate === "red" ? "Red" : "Green"} gate bailed; needs-human label applied.`);
}
