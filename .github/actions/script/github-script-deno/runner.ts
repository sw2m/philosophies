// Deno entrypoint for the github-script-deno composable action.
//
// Reads a user-supplied script from the path in argv[0], evaluates it with
// `github` (authenticated Octokit), `context` (GitHub event context), and
// `core` (@actions/core) in scope, then writes the script's return value
// to the action's `result` output.
//
// The npm: specifier pulls @actions/github and @actions/core directly from
// npm — same packages actions/github-script uses internally, so behaviour
// matches without a separate Octokit-for-Deno port.

import { context, getOctokit } from "npm:@actions/github@^6";
import * as core from "npm:@actions/core@^1";

const scriptPath = Deno.args[0];
if (!scriptPath) {
  console.error("usage: runner.ts <script-file>");
  Deno.exit(2);
}

const token = Deno.env.get("GITHUB_TOKEN");
if (!token) {
  console.error("GITHUB_TOKEN env var is required.");
  Deno.exit(2);
}

const script = await Deno.readTextFile(scriptPath);
const github = getOctokit(token);

// Wrap the user script in an async IIFE so top-level `await` works without
// the caller having to write `(async () => { ... })()` themselves — same
// ergonomics as actions/github-script's `script:` input.
const wrapped = `return (async () => {\n${script}\n})()`;
const fn = new Function("github", "context", "core", wrapped);

try {
  const result = await fn(github, context, core);
  if (result !== undefined) {
    const out = typeof result === "string" ? result : JSON.stringify(result);
    core.setOutput("result", out);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
  Deno.exit(1);
}
