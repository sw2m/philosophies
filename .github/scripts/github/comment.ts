// Generic Issue/PR Comment API primitive. One `Comment` instance starts
// as a scope handle (owner+repo+issue_number) and, after `create()`,
// IS the issue comment — every IssueComment field from Octokit's response
// shape is mutated into the instance via `Object.assign(this, r.data)`.
// Pattern mirrors `github/check.ts` (Check `implements CheckRun`).
//
// Unopinionated — input types derived directly from `@octokit/types`'s
// `Endpoints` map; constructor-known fields stripped. Callers wanting a
// templated/opinionated shape use the VSDD subclass at `../vsdd/comment.ts`.

import type { context, getOctokit } from "npm:@actions/github@^6";
import type { Endpoints } from "npm:@octokit/types@^14";

type Github = ReturnType<typeof getOctokit>;
type Context = typeof context;

type CreateOp = Endpoints["POST /repos/{owner}/{repo}/issues/{issue_number}/comments"];
type UpdateOp = Endpoints["PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}"];
type ListOp   = Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"];

/** Octokit's IssueComment entity shape — what `create()`/`update()` return. */
export type IssueComment = CreateOp["response"]["data"];

export type Ctx = { api: Github; owner: string; repo: string; issue_number: number };

export type CreateOpts =
  & Omit<CreateOp["parameters"], "owner" | "repo" | "issue_number">;

export type UpdateOpts =
  & Omit<UpdateOp["parameters"], "owner" | "repo">;

export type ListOpts =
  & Omit<ListOp["parameters"], "owner" | "repo" | "issue_number">;

// deno-lint-ignore no-explicit-any
export class Comment implements IssueComment {
  // --- scope (constructor-bound) ---
  api!: Github;
  owner!: string;
  repo!: string;
  issue_number!: number;

  // --- IssueComment fields, populated by create()/update()/load() ---
  // (typed `!:` because they're set by Object.assign post-API-call).
  id!: number;
  node_id!: string;
  url!: string;
  html_url!: string;
  body?: string;
  body_text?: string;
  body_html?: string;
  user!: IssueComment["user"];
  created_at!: string;
  updated_at!: string;
  issue_url!: string;
  author_association!: IssueComment["author_association"];
  reactions?: IssueComment["reactions"];
  performed_via_github_app?: IssueComment["performed_via_github_app"];

  constructor(ctx: Ctx) {
    this.api = ctx.api;
    this.owner = ctx.owner;
    this.repo = ctx.repo;
    this.issue_number = ctx.issue_number;
  }

  /** Post a new comment on the bound issue/PR. After resolution, `this`
   *  IS the IssueComment — every entity field is populated. */
  async create(opts: CreateOpts): Promise<this> {
    const r = await this.api.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.issue_number,
      ...opts,
    });
    Object.assign(this, r.data);
    return this;
  }

  /** Rewrite an existing comment by id. Refreshes `this` with the new
   *  entity state. */
  async update(opts: UpdateOpts): Promise<this> {
    const r = await this.api.rest.issues.updateComment({
      owner: this.owner,
      repo: this.repo,
      ...opts,
    });
    Object.assign(this, r.data);
    return this;
  }

  /** Delete a comment by id. */
  async delete(comment_id: number): Promise<void> {
    await this.api.rest.issues.deleteComment({
      owner: this.owner,
      repo: this.repo,
      comment_id,
    });
  }

  /** Paginate every comment on the bound issue/PR. The element type is
   *  what Octokit's `paginate` infers from listComments — structurally
   *  the same as IssueComment for our purposes. */
  list(opts: ListOpts = {}) {
    return this.api.paginate(this.api.rest.issues.listComments, {
      owner: this.owner,
      repo: this.repo,
      issue_number: this.issue_number,
      per_page: 100,
      ...opts,
    });
  }
}
