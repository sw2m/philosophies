// Git operations via simple-git. Thin re-export.
//
// Usage:
//   import git from "./.github/scripts/github/git.ts";
//   await git.fetch("origin", "main");
//   await git.checkout("feat/branch");

// @ts-types="npm:@types/simple-git@^3"
// deno-lint-ignore no-explicit-any
const simpleGit = (await import("npm:simple-git@^3")).default as any;
const git = simpleGit();

export default git;
