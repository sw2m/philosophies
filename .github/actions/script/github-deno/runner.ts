// Deno entrypoint for the github-deno composable action.
//
// Reads a user-supplied script from argv[0], evaluates it with the same set
// of injected globals actions/github-script provides (github, octokit,
// getOctokit, context, core, exec, glob, io, require), then writes the
// script's return value to the action's `result` output per `result-encoding`.
//
// The npm: specifier pulls @actions/* and @octokit/plugin-* directly from
// npm — same packages actions/github-script uses internally, so behaviour
// matches without a separate Octokit-for-Deno port.

import { context, getOctokit as raw } from "npm:@actions/github@^6";
import * as core from "npm:@actions/core@^1";
import * as exec from "npm:@actions/exec@^1";
import * as glob from "npm:@actions/glob@^0.5";
import * as io from "npm:@actions/io@^1";
import { retry } from "npm:@octokit/plugin-retry@^7";
import { requestLog } from "npm:@octokit/plugin-request-log@^5";
import { createRequire } from "node:module";

// Match actions/github-script's top-level handler so async rejection inside
// the user script doesn't crash the Deno runtime silently.
globalThis.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const err = e.reason;
  console.error(err);
  core.setFailed(`Unhandled error: ${err}`);
});

const path = Deno.args[0];
if (!path) {
  core.setFailed("usage: runner.ts <script-file>");
  Deno.exit(2);
}

const token = Deno.env.get("INPUT_GITHUB_TOKEN") || Deno.env.get("GITHUB_TOKEN");
if (!token) {
  core.setFailed("github-token (or GITHUB_TOKEN) is required.");
  Deno.exit(2);
}

const debug = Deno.env.get("INPUT_DEBUG") === "true";
const userAgent = Deno.env.get("INPUT_USER_AGENT") || "github-deno";
const previews = Deno.env.get("INPUT_PREVIEWS") || "";
const baseUrl = Deno.env.get("INPUT_BASE_URL") || "";
const retries = parseInt(Deno.env.get("INPUT_RETRIES") || "0", 10) || 0;
const doNotRetry = (Deno.env.get("INPUT_RETRY_EXEMPT_STATUS_CODES") || "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));
const encoding = Deno.env.get("INPUT_RESULT_ENCODING") || "json";

if (encoding !== "json" && encoding !== "string") {
  core.setFailed('"result-encoding" must be either "string" or "json"');
  Deno.exit(2);
}

// User-agent suffix mirrors actions/github-script's orchestration ID handling
// so requests are traceable when the action runs under GitHub's orchestrator.
function agent(base: string): string {
  const id = Deno.env.get("ACTIONS_ORCHESTRATION_ID");
  if (!id) return base;
  const sanitized = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${base} actions_orchestration_id/${sanitized}`;
}

type OctokitOpts = {
  log?: Console;
  userAgent?: string;
  previews?: string[];
  baseUrl?: string;
  request?: { retries?: number; doNotRetry?: number[] };
};

const opts: OctokitOpts = {
  log: debug ? console : undefined,
  userAgent: agent(userAgent),
  previews: previews ? previews.split(",").map((s) => s.trim()) : undefined,
};
if (baseUrl) opts.baseUrl = baseUrl;
if (retries > 0) {
  opts.request = { retries, doNotRetry };
}

// Plugins are passed as variadic trailing args to getOctokit per
// @actions/github's signature. retry adds @octokit/plugin-retry's behavior;
// requestLog enables verbose request logging when `debug=true`.
const github = raw(token, opts, retry, requestLog);

// Wrapped factory so user scripts that need additional Octokit clients
// inherit the same retry / user-agent / base-url config. Aliased to
// `getOctokit` inside the user script (the imported raw version is renamed
// at import).
function getOctokit(token: string, additional: Partial<OctokitOpts> = {}) {
  return raw(
    token,
    {
      ...opts,
      ...additional,
      request: { ...(opts.request ?? {}), ...(additional.request ?? {}) },
    },
    retry,
    requestLog,
  );
}

// `require` resolved relative to runner.ts so user scripts can pull in any
// Node module installed in the npm: cache (mirrors actions/github-script's
// wrapped-require behaviour).
const require = createRequire(import.meta.url);

const script = await Deno.readTextFile(path);

// Wrap user script in an async IIFE so top-level `await` Just Works without
// the caller writing `(async () => { ... })()` themselves — same ergonomics
// as actions/github-script's `script:` input.
const wrapped = `return (async () => {\n${script}\n})()`;
const fn = new Function(
  "github",
  "octokit",
  "getOctokit",
  "context",
  "core",
  "exec",
  "glob",
  "io",
  "require",
  wrapped,
);

try {
  const result = await fn(
    github,
    github,
    getOctokit,
    context,
    core,
    exec,
    glob,
    io,
    require,
  );

  // Encoding contract matches actions/github-script:
  //   json   → JSON.stringify(result) (default; quotes strings, encodes objects)
  //   string → String(result)
  // Skip setOutput entirely when the script returned undefined — both
  // encodings would produce a meaningless output otherwise (JSON.stringify
  // returns the value undefined; String() returns the string "undefined").
  if (result !== undefined) {
    const output = encoding === "json" ? JSON.stringify(result) : String(result);
    core.setOutput("result", output);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
  Deno.exit(1);
}
