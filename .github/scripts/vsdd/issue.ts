// VSDD-flavored Issue — extends the unopinionated github/issue.ts with a
// mustache template that renders structured data into the issue body.
// Subclasses pin a specific template + field schema in their constructor.
//
// Same pattern as vsdd/comment.ts: opinionated body rendering atop the
// unopinionated GitHub primitive.

import Mustache from "npm:mustache@^4";
import { Issue as Base, type CreateOpts, type Ctx } from "../github/issue.ts";

export type { Ctx };

/** Constructor opts for a templated VSDD issue. The `template` is a
 *  mustache string used to render the issue BODY; title + labels +
 *  assignees stay first-class fields on `post(data, extra)`. */
export type Opts = Ctx & { template: string };

export class Issue extends Base {
  template: string;

  constructor(opts: Opts) {
    super(opts);
    this.template = opts.template;
  }

  /** Render the body template against `data`. Pure; does not call the
   *  GitHub API. Use `{{{var}}}` (triple-brace) for content that should
   *  not be HTML-escaped (URLs, raw markdown). */
  render(data: Record<string, unknown>): string {
    return Mustache.render(this.template, data);
  }

  /** Render + open in one step. `data` feeds the template; `extra`
   *  carries title/labels/assignees/milestone (everything except body).
   *  Returns `this` (now populated as the created IssueEntity via the
   *  inherited `create()` flow). */
  async post(data: Record<string, unknown>, extra: Omit<CreateOpts, "body">): Promise<this> {
    return await this.create({ ...extra, body: this.render(data) });
  }
}
