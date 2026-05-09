// Org-membership verification. Replaces the bash gate duplicated across
// every agent composite and the promote composites. Uses the injected
// `github` octokit from github-deno — callers invoke from a github-deno
// script context where `github` is available as a global.
//
// Usage (inside a github-deno `script:` block):
//   const org = await import("./.github/scripts/github/org.ts");
//   await org.verify({ github, core, context });

type Opts = {
  /** Octokit client (injected by github-deno as `github`). */
  api: { rest: { orgs: { checkMembershipForUser: Function } } };
  /** @actions/core (injected by github-deno as `core`). */
  core: { notice: Function; setFailed: Function };
  /** GitHub org slug. Default `sw2m`. */
  org?: string;
  /** Actor login to validate. Falls back to `sender` if empty. */
  actor?: string;
  /** Trigger sender login (context.actor or event.sender.login). */
  sender: string;
  /** When true, accept `github-actions[bot]` without an API check. */
  bot?: boolean;
};

/** Verify `actor` (or `sender`) is a public member of `org`. Calls
 *  `core.setFailed` and throws on denial so the step fails cleanly. */
export async function verify(opts: Opts): Promise<string> {
  const org = opts.org ?? "sw2m";
  const actor = opts.actor || opts.sender;

  if (opts.actor && opts.actor !== opts.sender) {
    console.log(`actor-override active: validating '${opts.actor}' instead of '${opts.sender}'.`);
  }

  if (opts.bot && actor === "github-actions[bot]") {
    (opts.core.notice as (msg: string) => void)(
      "Accepting github-actions[bot] under trust-github-actions-bot opt-in.",
    );
    return actor;
  }

  try {
    await (opts.api.rest.orgs.checkMembershipForUser as Function)({
      org,
      username: actor,
    });
    console.log(`✓ ${actor} is a ${org} org member.`);
    return actor;
  } catch {
    const msg = `${actor} is not a (publicly-visible) member of '${org}'.`;
    (opts.core.setFailed as (msg: string) => void)(msg);
    throw new Error(msg);
  }
}
