// Generic Issues API primitive. One `Issue` instance starts as a scope
// handle (owner+repo) and, after `create()`, IS the issue — every
// IssueEntity field is mutated into the instance via
// `Object.assign(this, r.data)`. Same pattern as `github/check.ts` and
// `github/comment.ts`.
//
// Unopinionated — input types derived directly from `@octokit/types`'s
// `Endpoints` map. Callers wanting a templated/opinionated shape use the
// VSDD subclass at `../vsdd/issue.ts`.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";
import { Comment, type ListOpts } from "./comment.ts";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

type CreateOp = Endpoints["POST /repos/{owner}/{repo}/issues"];
type UpdateOp = Endpoints["PATCH /repos/{owner}/{repo}/issues/{issue_number}"];
type GetOp    = Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"];
type ListOp   = Endpoints["GET /repos/{owner}/{repo}/issues"];

/** Octokit's Issue entity shape — what `create()`/`update()`/`get()` return. */
export type IssueEntity = CreateOp["response"]["data"];

export type Ctx = { api: Github; owner: string; repo: string };

export type CreateOpts = Omit<CreateOp["parameters"], "owner" | "repo">;
export type UpdateOpts = Omit<UpdateOp["parameters"], "owner" | "repo">;
export type GetOpts    = Omit<GetOp["parameters"],    "owner" | "repo">;
// (Comment.ListOpts imported above; issue list params use the shape inline below.)

export class Issue implements IssueEntity {
  // --- scope (constructor-bound) ---
  api!: Github;
  owner!: string;
  repo!: string;

  // --- IssueEntity fields, populated after create()/update()/get() ---
  id!: number;
  node_id!: string;
  url!: string;
  repository_url!: string;
  labels_url!: string;
  comments_url!: string;
  events_url!: string;
  html_url!: string;
  number!: number;
  state!: string;
  state_reason?: IssueEntity["state_reason"];
  title!: string;
  body?: string | null;
  user!: IssueEntity["user"];
  labels!: IssueEntity["labels"];
  assignee!: IssueEntity["assignee"];
  assignees?: IssueEntity["assignees"];
  milestone!: IssueEntity["milestone"];
  locked!: boolean;
  active_lock_reason?: string | null;
  comments!: number;
  pull_request?: IssueEntity["pull_request"];
  closed_at!: string | null;
  created_at!: string;
  updated_at!: string;
  draft?: boolean;
  closed_by?: IssueEntity["closed_by"];
  body_html?: string;
  body_text?: string;
  timeline_url?: string;
  repository?: IssueEntity["repository"];
  performed_via_github_app?: IssueEntity["performed_via_github_app"];
  author_association!: IssueEntity["author_association"];
  reactions?: IssueEntity["reactions"];
  sub_issues_summary?: IssueEntity["sub_issues_summary"];
  type?: IssueEntity["type"];

  constructor(ctx: Ctx) {
    this.api = ctx.api;
    this.owner = ctx.owner;
    this.repo = ctx.repo;
  }

  /** Open a new issue. After resolution, `this` IS the IssueEntity. */
  async create(opts: CreateOpts): Promise<this> {
    const r = await this.api.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      ...opts,
    });
    Object.assign(this, r.data);
    return this;
  }

  /** Patch an existing issue (must specify issue_number). Refreshes
   *  `this` with the new entity state. */
  async update(opts: UpdateOpts): Promise<this> {
    const r = await this.api.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      ...opts,
    });
    Object.assign(this, r.data);
    return this;
  }

  /** Hydrate `this` from an existing issue by number. */
  async get(opts: GetOpts): Promise<this> {
    const r = await this.api.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      ...opts,
    });
    Object.assign(this, r.data);
    return this;
  }

  /** Paginate issues on the bound repo. */
  list(opts: Omit<ListOp["parameters"], "owner" | "repo"> = {}) {
    return this.api.paginate(this.api.rest.issues.listForRepo, {
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
      ...opts,
    });
  }

  /** Shorthand: the issue's comment thread. Hydrates a `Comment` bound to
   *  THIS issue and lists its comments. Requires `this.number` to be set
   *  (call `get()`/`create()` first). Pass `{bot: true}` to filter to
   *  github-actions[bot]-authored comments.
   *
   *  Named `thread()` not `comments()` because IssueEntity has a
   *  `comments: number` field (the count) — a method shadowing it would
   *  fail to satisfy `implements IssueEntity`. */
  thread(opts: ListOpts = {}) {
    if (!this.number) {
      throw new Error("Issue.thread() requires this.number — call get() or create() first");
    }
    return new Comment({
      api: this.api,
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
    }).list(opts);
  }
}
