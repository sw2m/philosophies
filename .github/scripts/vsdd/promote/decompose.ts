// Decompose comment — posted on a goal-spec after `promote-goal-to-tech`
// runs. Reports the count of opened tech-spec sub-issues (or, when the
// agent declined to decompose, the agent's free-form rationale).
//
// Subclasses `vsdd/comment.ts`, pinning the mustache template and a
// `slice()` helper that turns an agent response file (interspersed
// `<!-- vsdd-tech-spec: { title } -->` markers + prose between them)
// into the `tech_specs[]` payload that drives downstream issue creation.

import { Comment as Base, type Ctx } from "../comment.ts";
import { marks } from "../frontmatter.ts";

const KEY = "vsdd-tech-spec";

const TEMPLATE = await Deno.readTextFile(new URL("./decompose.mustache", import.meta.url));

export type Spec = { title: string; body: string };

export class Decompose extends Base {
  constructor(ctx: Ctx) {
    super({ ...ctx, template: TEMPLATE });
  }

  /** Walk an agent response and split it into per-tech-spec sections.
   *  Each `<!-- vsdd-tech-spec: { title: "..." } -->` marker introduces
   *  a section; the section's body is the prose between this marker and
   *  the NEXT marker (or end of file). Markers without a `title` field
   *  are skipped silently — malformed agent output won't open issues
   *  with empty titles. */
  static slice(raw: string): Spec[] {
    const all = marks(raw);
    const matching: Array<{ title: string; start: number; end: number }> = [];
    for (const m of all) {
      const v = m.value;
      if (typeof v !== "object" || v === null || Array.isArray(v)) continue;
      const inner = (v as Record<string, unknown>)[KEY];
      if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
      const title = (inner as Record<string, unknown>).title;
      if (typeof title !== "string" || title.trim() === "") continue;
      matching.push({ title: title.trim(), start: m.start, end: m.end });
    }

    const out: Spec[] = [];
    for (let i = 0; i < matching.length; i++) {
      const m = matching[i];
      const next = matching[i + 1];
      const bodyStart = m.end;
      const bodyEnd = next ? next.start : raw.length;
      const body = raw.slice(bodyStart, bodyEnd).trim();
      out.push({ title: m.title, body });
    }
    return out;
  }
}
