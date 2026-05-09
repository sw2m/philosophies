// State machine for the goal→tech promotion flow. Decompose owns:
//   - parsing the agent's raw response into per-tech-spec sections
//   - opening each section as a Spec sub-issue (delegated to Spec, but
//     orchestrated here)
//   - posting the parent-goal comment summarizing the decomposition
//
// Spec is an internal artifact of Decompose, not a sibling primitive —
// callers do not instantiate Spec directly. The workflow constructs one
// Decompose, calls `run()`, and is done.
//
// Inherits from vsdd/comment.ts (the parent-goal comment side); pulls
// Spec from ./spec.ts (the sub-issue side). One state machine, two
// outcomes (sub-issues + summary comment).

import { Comment as Base, type Ctx } from "../../comment.ts";
import { marks } from "../../frontmatter.ts";
import { Spec } from "./spec.ts";

const KEY = "tech-spec";  // subkey under vsdd: namespace

const TEMPLATE = await Deno.readTextFile(new URL("./decompose.mustache", import.meta.url));

export type Opts = Ctx & { raw: string; actor: string };

export class Decompose extends Base {
  raw: string;
  actor: string;
  specs: Spec[] = [];

  constructor(opts: Opts) {
    super({ ...opts, template: TEMPLATE });
    this.raw = opts.raw;
    this.actor = opts.actor;
  }

  /** Walk the raw agent output and split it into per-tech-spec sections.
   *  Each `<!-- vsdd: { tech-spec: { title } } -->` marker introduces a section;
   *  the section's body is the prose between this marker and the next
   *  marker (or end of file). Markers without a `title` field are skipped
   *  silently. Pure; does not call the GitHub API. */
  parsed(): Array<{ title: string; body: string }> {
    const matching: Array<{ title: string; start: number; end: number }> = [];
    for (const m of marks(this.raw)) {
      const v = m.value;
      if (typeof v !== "object" || v === null || Array.isArray(v)) continue;
      const ns = (v as Record<string, unknown>).vsdd;
      if (typeof ns !== "object" || ns === null || Array.isArray(ns)) continue;
      const inner = (ns as Record<string, unknown>)[KEY];
      if (typeof inner !== "object" || inner === null || Array.isArray(inner)) continue;
      const title = (inner as Record<string, unknown>).title;
      if (typeof title !== "string" || title.trim() === "") continue;
      matching.push({ title: title.trim(), start: m.start, end: m.end });
    }

    const out: Array<{ title: string; body: string }> = [];
    for (let i = 0; i < matching.length; i++) {
      const m = matching[i];
      const next = matching[i + 1];
      const body = this.raw.slice(m.end, next ? next.start : this.raw.length).trim();
      out.push({ title: m.title, body });
    }
    return out;
  }

  /** Free-form preamble — text before the first marker (or the whole
   *  body if no markers found). Used as the agent's rationale on the
   *  zero-spec path. Pure. */
  preamble(): string {
    const i = this.raw.indexOf("<!--");
    return (i === -1 ? this.raw : this.raw.slice(0, i)).trim();
  }

  /** Open one Spec sub-issue per parsed tech-spec. Each created Spec is
   *  appended to `this.specs` (the instance carries every IssueEntity
   *  field after `post()` resolves). */
  async open(): Promise<this> {
    for (const { title, body } of this.parsed()) {
      const spec = new Spec({ api: this.api, owner: this.owner, repo: this.repo });
      const data = { body, parent: this.issue_number, owner: this.actor };
      try {
        await spec.post(data, { title, labels: ["spec:tech"] });
      } catch {
        // Label may be missing on a downstream repo. Retry without.
        await spec.post(data, { title });
      }
      console.log(`  opened: ${spec.html_url}`);
      this.specs.push(spec);
    }
    return this;
  }

  /** Render + post the parent-goal comment summarizing decomposition. */
  async summarize(): Promise<this> {
    const opened = this.specs.map((s) => ({ title: s.title, url: s.html_url }));
    await this.post({
      owner: this.actor,
      opened,
      summary: this.preamble().slice(0, 1500),
    });
    return this;
  }

  /** Drive the full goal→tech promotion: open sub-issues, post the
   *  parent-goal summary. */
  async run(): Promise<this> {
    await this.open();
    await this.summarize();
    return this;
  }
}
