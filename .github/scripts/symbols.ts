// Typed wrapper over the canonical CI symbol catalog at
// `.github/assets/symbols.yaml`. Loads the YAML at module-load time,
// validates the structural shape, and re-exports convenience views.
//
// Single-source-of-truth design: the YAML is the ONLY place reviewer slugs,
// verdict values, category slugs, label strings, and frontmatter tokens
// live. This module deliberately does NOT mirror those literals as TS
// union types — that would be drift bait (any YAML edit would silently
// stale the TS unions). Convenience exports are typed as plain `string` /
// `string[]` / `Record<string, ...>`; consumers that need narrower types
// can do their own runtime check + cast at the call site.
//
// Python / bash / non-Deno consumers parse the YAML directly via
// `yq` / `pyyaml` / etc. — they don't go through this wrapper.

import { parse } from "jsr:@std/yaml@^1";

// ─── Catalog shape ─────────────────────────────────────────────────────────
// Schema description: defines the required structural keys but treats their
// values as opaque strings. The runtime `validate` function below enforces
// presence; the YAML enforces literal correctness. Compile-time slug-typo
// narrowing is intentionally sacrificed in exchange for a single source of
// truth.

export interface Catalog {
  reviewers: {
    agents: string[];
    special: Record<string, string>;
  };
  verdicts: {
    "phase-1c": string[];
    "phase-3": string[];
  };
  conclusions: string[];
  phases: Record<string, { name: string; section: string }>;
  categories: Record<string, { display: string; section: string }>;
  "aggregate-checkrun": string;
  labels: {
    spec: { goal: string; tech: string };
    brand: { "opt-out": string };
    meta: { "ci-meta": string; "needs-human": string };
  };
  "frontmatter-tokens": {
    "phase-1c": string;
    "phase-3": string;
    "opt-out-brand": string;
    canonical: string;
  };
}

// ─── Load + parse ──────────────────────────────────────────────────────────

const path = new URL("../assets/symbols.yaml", import.meta.url);
const raw = await Deno.readTextFile(path);
const parsed = parse(raw) as Catalog;
validate(parsed);

// Runtime shape assertion. Compile-time `as Catalog` only checks at the
// type level — if the YAML drops a section or renames a key, downstream
// access fails with cryptic undefined errors. Throw fast at module load
// with a useful path so the operator can fix the YAML.
function validate(c: unknown): asserts c is Catalog {
  if (!c || typeof c !== "object") {
    throw new Error("symbols.yaml: top-level value is not an object");
  }
  const required: ReadonlyArray<keyof Catalog> = [
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
      throw new Error(`symbols.yaml: missing top-level key '${String(key)}'`);
    }
  }
  const cat = c as Catalog;

  // reviewers.agents — non-empty array
  if (!Array.isArray(cat.reviewers?.agents) || cat.reviewers.agents.length === 0) {
    throw new Error("symbols.yaml: reviewers.agents must be a non-empty array");
  }
  // reviewers.special — required object containing all four known special slugs
  for (const slug of ["orchestrator", "applicability", "consensus", "meta"] as const) {
    if (!cat.reviewers?.special?.[slug]) {
      throw new Error(`symbols.yaml: reviewers.special.${slug} required`);
    }
  }

  // verdicts.phase-1c and verdicts.phase-3 — non-empty arrays
  for (const phase of ["phase-1c", "phase-3"] as const) {
    if (!Array.isArray(cat.verdicts?.[phase]) || cat.verdicts[phase].length === 0) {
      throw new Error(`symbols.yaml: verdicts.${phase} must be a non-empty array`);
    }
  }

  // conclusions — non-empty array
  if (!Array.isArray(cat.conclusions) || cat.conclusions.length === 0) {
    throw new Error("symbols.yaml: conclusions must be a non-empty array");
  }

  // phases — must contain at least the two known slugs
  for (const phase of ["1c", "3"] as const) {
    if (!cat.phases?.[phase] || typeof cat.phases[phase] !== "object") {
      throw new Error(`symbols.yaml: phases['${phase}'] missing or not an object`);
    }
  }

  // categories — non-empty record
  if (!cat.categories || Object.keys(cat.categories).length === 0) {
    throw new Error("symbols.yaml: categories must be a non-empty object");
  }

  // labels.spec.{goal,tech} — promotion + brand contracts
  if (!cat.labels?.spec?.goal || !cat.labels?.spec?.tech) {
    throw new Error("symbols.yaml: labels.spec.{goal,tech} both required");
  }
  // labels.brand.opt-out — vsdd-brand.yml signal
  if (!cat.labels?.brand?.["opt-out"]) {
    throw new Error("symbols.yaml: labels.brand.opt-out required");
  }
  // labels.meta.{ci-meta,needs-human} — gap-finder + bail signals
  for (const key of ["ci-meta", "needs-human"] as const) {
    if (!cat.labels?.meta?.[key]) {
      throw new Error(`symbols.yaml: labels.meta.${key} required`);
    }
  }

  // frontmatter-tokens — must contain all four required keys
  for (const tok of ["phase-1c", "phase-3", "opt-out-brand", "canonical"] as const) {
    if (!cat["frontmatter-tokens"]?.[tok]) {
      throw new Error(`symbols.yaml: frontmatter-tokens.${tok} required`);
    }
  }
}

// ─── Convenience exports ───────────────────────────────────────────────────
// Typed views of the catalog. Consumers prefer these named exports over
// reaching into `SYMBOLS` directly — they're stable surface even if the
// YAML's internal layout shifts.

export const SYMBOLS: Catalog = parsed;

export const REVIEWERS: readonly string[] = parsed.reviewers.agents;
export const VERDICTS = parsed.verdicts;
export const CONCLUSIONS: readonly string[] = parsed.conclusions;
export const PHASES = parsed.phases;
export const CATEGORIES = parsed.categories;
export const CATEGORY_SLUGS: readonly string[] = Object.keys(parsed.categories);
export const AGGREGATE_CHECKRUN: string = parsed["aggregate-checkrun"];
export const LABELS = parsed.labels;
export const FRONTMATTER = parsed["frontmatter-tokens"];
