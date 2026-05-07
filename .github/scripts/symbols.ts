// Cached parsed export of `.github/assets/symbols.yaml`. Loads the YAML at
// module-load time, runs a structural sanity check, exposes the result as
// the single `SYMBOLS` export.
//
// No types beyond `any`. The YAML is the only source of truth, and
// mirroring its shape in TS would just be drift bait. Consumers navigate
// `SYMBOLS` directly and apply local type assertions where they care.
//
// Python / bash / non-Deno consumers parse the YAML themselves via
// `yq` / `pyyaml` / etc. — they don't go through this module.

import { parse } from "jsr:@std/yaml@^1";

const path = new URL("../assets/symbols.yaml", import.meta.url);
// deno-lint-ignore no-explicit-any
const parsed: any = parse(await Deno.readTextFile(path));
validate(parsed);

// deno-lint-ignore no-explicit-any
export const SYMBOLS: any = parsed;

// Runtime structural sanity check. Fails fast at module load with a precise
// path if the YAML is malformed or missing required keys. Doesn't enforce
// literal values — the YAML is the source of truth for those.
// deno-lint-ignore no-explicit-any
function validate(c: any): void {
  if (!c || typeof c !== "object") {
    throw new Error("symbols.yaml: top-level value is not an object");
  }
  const required = [
    "reviewers",
    "verdicts",
    "conclusions",
    "phases",
    "categories",
    "aggregate-checkrun",
    "labels",
    "frontmatter-tokens",
  ];
  for (const key of required) {
    if (!(key in c)) {
      throw new Error(`symbols.yaml: missing top-level key '${key}'`);
    }
  }
  if (!Array.isArray(c.reviewers?.agents) || c.reviewers.agents.length === 0) {
    throw new Error("symbols.yaml: reviewers.agents must be a non-empty array");
  }
  for (const slug of ["orchestrator", "applicability", "consensus", "meta"]) {
    if (!c.reviewers?.special?.[slug]) {
      throw new Error(`symbols.yaml: reviewers.special.${slug} required`);
    }
  }
  for (const phase of ["phase-1c", "phase-3"]) {
    if (!Array.isArray(c.verdicts?.[phase]) || c.verdicts[phase].length === 0) {
      throw new Error(`symbols.yaml: verdicts.${phase} must be a non-empty array`);
    }
  }
  if (!Array.isArray(c.conclusions) || c.conclusions.length === 0) {
    throw new Error("symbols.yaml: conclusions must be a non-empty array");
  }
  for (const phase of ["1c", "3"]) {
    if (!c.phases?.[phase] || typeof c.phases[phase] !== "object") {
      throw new Error(`symbols.yaml: phases['${phase}'] missing or not an object`);
    }
  }
  if (!c.categories || Object.keys(c.categories).length === 0) {
    throw new Error("symbols.yaml: categories must be a non-empty object");
  }
  if (!c.labels?.spec?.goal || !c.labels?.spec?.tech) {
    throw new Error("symbols.yaml: labels.spec.{goal,tech} both required");
  }
  if (!c.labels?.brand?.["opt-out"]) {
    throw new Error("symbols.yaml: labels.brand.opt-out required");
  }
  for (const key of ["ci-meta", "needs-human"]) {
    if (!c.labels?.meta?.[key]) {
      throw new Error(`symbols.yaml: labels.meta.${key} required`);
    }
  }
  for (const tok of ["phase-1c", "phase-3", "opt-out-brand", "canonical"]) {
    if (!c["frontmatter-tokens"]?.[tok]) {
      throw new Error(`symbols.yaml: frontmatter-tokens.${tok} required`);
    }
  }
}
