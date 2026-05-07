// VSDD-flavored Comment — extends the unopinionated github/comment.ts with
// a mustache template that renders structured data into the comment body.
// Subclasses pin a specific template and field schema in their constructor.
//
// All VSDD comments, issue bodies, and PR bodies are mustache templates.
// Concrete subclasses (`vsdd/promote/decompose.ts`, future `vsdd/phase-1c/*`,
// future `vsdd/phase-3/*`) instantiate this with their fixed template and
// add domain-specific render data construction.

import Mustache from "npm:mustache@^4";
import { Comment as Base, type CreateOpts, type Ctx } from "../github/comment.ts";

export type { Ctx };

/** Constructor opts for a templated VSDD comment. The `template` is a
 *  mustache string; `render(data)` substitutes data into it; `post(data)`
 *  is shorthand for `create({ body: render(data) })`. */
export type Opts = Ctx & { template: string };

export class Comment extends Base {
  template: string;

  constructor(opts: Opts) {
    super(opts);
    this.template = opts.template;
  }

  /** Render the template against `data`. Pure; does not call the GitHub API. */
  render(data: Record<string, unknown>): string {
    return Mustache.render(this.template, data);
  }

  /** Render + post in one step. Returns `this` (now populated as the
   *  created IssueComment via the inherited `create()` flow). */
  async post(data: Record<string, unknown>, extra: Omit<CreateOpts, "body"> = {}): Promise<this> {
    return await this.create({ ...extra, body: this.render(data) });
  }
}
