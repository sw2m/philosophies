// Tech-spec sub-issue — opened by `promote-goal-to-tech` for each
// `vsdd-tech-spec` marker the agent emitted. Body is the agent's prose
// for that spec, with a footer crediting the parent goal + owner +
// pipeline phase. All formatting lives in the mustache template; the
// caller passes the data, calls `post()`.

import { Issue as Base, type Ctx } from "../issue.ts";

const TEMPLATE = [
  "{{{body}}}",
  "",
  "---",
  "_Tech-spec sub-issue of #{{parent}} (goal). Opened by `promote-goal-to-tech` after @{{owner}} self-assigned the goal._",
  "_Assign yourself to this issue to start the 5-phase tech→PR pipeline._",
].join("\n");

export class Spec extends Base {
  constructor(ctx: Ctx) {
    super({ ...ctx, template: TEMPLATE });
  }
}
