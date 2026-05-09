// Thin git CLI wrapper. Avoids `new Deno.Command("git", ...)` boilerplate
// scattered across scripts. Each function is a single-word verb.

/** Run git with inherited stdio. Returns exit code. */
export async function run(...args: string[]): Promise<number> {
  return (await new Deno.Command("git", { args, stdout: "inherit", stderr: "inherit" }).output()).code;
}

/** Run git silently (no output). Returns exit code. */
export async function silent(...args: string[]): Promise<number> {
  return (await new Deno.Command("git", { args, stdout: "null", stderr: "null" }).output()).code;
}

/** Capture git stdout as text. */
export async function capture(...args: string[]): Promise<string> {
  const { stdout } = await new Deno.Command("git", { args, stdout: "piped", stderr: "null" }).output();
  return new TextDecoder().decode(stdout).trim();
}

export async function config(key: string, value: string): Promise<void> {
  await run("config", key, value);
}

export async function fetch(remote: string, ref?: string): Promise<void> {
  const args = ["fetch", remote];
  if (ref) args.push(ref);
  await run(...args);
}

export async function checkout(branch: string, from?: string): Promise<void> {
  if (from) await run("checkout", "-b", branch, from);
  else await run("checkout", branch);
}

/** True iff `branch` exists on `remote`. */
export async function exists(remote: string, branch: string): Promise<boolean> {
  return (await silent("ls-remote", "--exit-code", "--heads", remote, branch)) === 0;
}

export async function commit(msg: string, opts?: { empty?: boolean }): Promise<void> {
  const args = ["commit"];
  if (opts?.empty) args.push("--allow-empty");
  args.push("-m", msg);
  await run(...args);
}

export async function push(remote: string, branch: string, opts?: { upstream?: boolean }): Promise<void> {
  const args = ["push"];
  if (opts?.upstream) args.push("-u");
  args.push(remote, branch);
  await run(...args);
}

export async function add(...paths: string[]): Promise<void> {
  await run("add", ...paths);
}

export async function stash(opts?: { untracked?: boolean }): Promise<void> {
  const args = ["stash"];
  if (opts?.untracked) args.push("--include-untracked");
  await silent(...args);
}

export async function clean(): Promise<void> {
  await run("checkout", "--", ".");
  await run("clean", "-fd");
}

/** True iff there are staged changes. */
export async function staged(): Promise<boolean> {
  return (await silent("diff", "--cached", "--quiet")) !== 0;
}
