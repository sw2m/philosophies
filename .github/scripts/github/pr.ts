// Generic Pull Request API primitive. Same pattern as Issue and Comment:
// scope handle → create()/get() mutates `this` via Object.assign.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;

type CreateOp = Endpoints["POST /repos/{owner}/{repo}/pulls"];
type GetOp    = Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"];
type ListOp   = Endpoints["GET /repos/{owner}/{repo}/pulls"];

export type PullEntity = CreateOp["response"]["data"];
export type Ctx = { api: Github; owner: string; repo: string };
export type CreateOpts = Omit<CreateOp["parameters"], "owner" | "repo">;
export type GetOpts    = Omit<GetOp["parameters"],    "owner" | "repo">;

// deno-lint-ignore no-explicit-any
export class Pull {
  api!: Github;
  owner!: string;
  repo!: string;

  // PullEntity fields — populated after create/get/find
  id!: number;
  node_id!: string;
  url!: string;
  html_url!: string;
  diff_url!: string;
  patch_url!: string;
  issue_url!: string;
  commits_url!: string;
  review_comments_url!: string;
  review_comment_url!: string;
  comments_url!: string;
  statuses_url!: string;
  number!: number;
  state!: PullEntity["state"];
  locked!: boolean;
  title!: string;
  body!: string | null;
  user!: PullEntity["user"];
  labels!: PullEntity["labels"];
  milestone!: PullEntity["milestone"];
  active_lock_reason?: string | null;
  created_at!: string;
  updated_at!: string;
  closed_at!: string | null;
  merged_at!: string | null;
  merge_commit_sha!: string | null;
  assignee!: PullEntity["assignee"];
  assignees?: PullEntity["assignees"];
  requested_reviewers?: PullEntity["requested_reviewers"];
  requested_teams?: PullEntity["requested_teams"];
  head!: PullEntity["head"];
  base!: PullEntity["base"];
  _links!: PullEntity["_links"];
  author_association!: PullEntity["author_association"];
  auto_merge!: PullEntity["auto_merge"];
  draft?: boolean;
  merged!: boolean;
  mergeable!: boolean | null;
  rebaseable?: boolean | null;
  mergeable_state!: string;
  merged_by!: PullEntity["merged_by"];
  // deno-lint-ignore no-explicit-any
  [key: string]: any;

  constructor(ctx: Ctx) {
    this.api = ctx.api;
    this.owner = ctx.owner;
    this.repo = ctx.repo;
  }

  async create(opts: CreateOpts): Promise<this> {
    const r = await this.api.rest.pulls.create({ owner: this.owner, repo: this.repo, ...opts });
    Object.assign(this, r.data);
    return this;
  }

  async get(opts: GetOpts): Promise<this> {
    const r = await this.api.rest.pulls.get({ owner: this.owner, repo: this.repo, ...opts });
    Object.assign(this, r.data);
    return this;
  }

  /** Find an existing open PR by head branch. Returns this (hydrated)
   *  or null if none found. */
  async find(opts: { head: string; base?: string }): Promise<this | null> {
    const list = await this.api.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      head: opts.head.includes(":") ? opts.head : `${this.owner}:${opts.head}`,
      base: opts.base,
      state: "open",
    });
    if (list.data.length === 0) return null;
    Object.assign(this, list.data[0]);
    return this;
  }
}
