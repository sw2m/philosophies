// Generic HTML-comment YAML frontmatter extractor.
//
// Parses every well-formed HTML-comment block in a body file (delegates
// to vsdd/frontmatter.ts for the shape rules; format-agnostic), evaluates
// a jsonata expression against the parsed-blocks array, and writes each
// matching value to a separate file in the output directory. Prints a
// JSON array of the written file paths to stdout.
//
// jsonata implicit-projection means the user writes a per-block
// expression — array iteration is automatic. `vsdd.pretesting` against
// an array of blocks yields the `vsdd.pretesting` value of each block
// where the path resolves; undefined slots are skipped. No explicit
// iteration prefix; no null filter.
//
// Multiple matches → multiple files. Filename stems are chosen by the
// naming scheme:
//   - `index`   — 0, 1, 2, ... (default; ordered, simple)
//   - `sha`     — sha256-prefix; same content → same filename (dedup)
//   - `alpha`   — a, b, ..., z, aa, ab, ... (human-readable iteration)
//
// File extension follows `--format`: `.json` (default) or `.yaml`.
//
// Usage:
//   deno run --allow-read --allow-write extract.ts \
//     --query <jsonata-expr> \
//     --out-dir <dir> \
//     [--format json|yaml] \
//     [--naming index|sha|alpha] \
//     <body-file>
//
// Sample expressions (per-block; pure jsonata, no iteration prefix):
//   `foo`                          — every block's `foo` value (defined)
//   `\`vsdd-tech-spec\`.title`     — every tech-spec marker's title
//   `vsdd.pretesting`              — every pretesting block (post-#214)
//   `*[reviewer = 'gemini']`       — every block where reviewer is gemini
//
// Output: JSON array of file paths on stdout. Exit codes:
//   - 0 — success (zero or more matches written)
//   - 1 — jsonata evaluation failure (invalid expression, bad path)
//   - 2 — usage error (missing flag, invalid value)

import jsonata from "npm:jsonata@^2";
import { parse as parseBlocks } from "./vsdd/frontmatter.ts";
import { stringify as toYaml } from "jsr:@std/yaml@^1";
import { encodeHex } from "jsr:@std/encoding@^1/hex";

type Args = {
  query: string;
  outDir: string;
  format: "json" | "yaml";
  naming: "index" | "sha" | "alpha";
  bodyFile: string;
};

function args(argv: string[]): Args {
  const a: Partial<Args> = { format: "json", naming: "index" };
  let i = 0;
  while (i < argv.length) {
    const t = argv[i];
    if (t === "--query") a.query = argv[++i];
    else if (t === "--out-dir") a.outDir = argv[++i];
    else if (t === "--format") a.format = argv[++i] as Args["format"];
    else if (t === "--naming") a.naming = argv[++i] as Args["naming"];
    else if (t.startsWith("--")) {
      console.error(`unknown flag: ${t}`);
      Deno.exit(2);
    } else a.bodyFile = t;
    i++;
  }
  if (!a.query || !a.outDir || !a.bodyFile) {
    console.error(
      "usage: extract.ts --query <jsonata-expr> --out-dir <dir> [--format json|yaml] [--naming index|sha|alpha] <body-file>",
    );
    Deno.exit(2);
  }
  if (a.format !== "json" && a.format !== "yaml") {
    console.error(`invalid --format: ${a.format} (expected json|yaml)`);
    Deno.exit(2);
  }
  if (a.naming !== "index" && a.naming !== "sha" && a.naming !== "alpha") {
    console.error(`invalid --naming: ${a.naming} (expected index|sha|alpha)`);
    Deno.exit(2);
  }
  return a as Args;
}

function alpha(i: number): string {
  // 0→a, 25→z, 26→aa, 27→ab, ... 701→zz, 702→aaa
  let n = i + 1;
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

async function sha(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return encodeHex(hash).slice(0, 16);
}

/** Normalize a jsonata result to an always-array of matches. jsonata's
 *  sequence semantics return: `undefined` for no matches, the single
 *  value for one match, or an array for two-plus. extract.ts treats them
 *  uniformly as "list of matches to write." */
function flatten(result: unknown): unknown[] {
  if (result === undefined) return [];
  if (Array.isArray(result)) return result;
  return [result];
}

if (import.meta.main) {
  const a = args(Deno.args);

  const raw = await Deno.readTextFile(a.bodyFile);
  const blocks = parseBlocks(raw);

  let result: unknown;
  try {
    result = await jsonata(a.query).evaluate(blocks);
  } catch (e) {
    console.error(`jsonata evaluation failed: ${(e as Error).message}`);
    Deno.exit(1);
  }
  const matches = flatten(result);

  await Deno.mkdir(a.outDir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const v = matches[i];
    const content = a.format === "yaml" ? toYaml(v) : JSON.stringify(v, null, 2);
    let stem: string;
    if (a.naming === "index") stem = String(i);
    else if (a.naming === "alpha") stem = alpha(i);
    else stem = await sha(content);
    const path = `${a.outDir.replace(/\/$/, "")}/${stem}.${a.format}`;
    await Deno.writeTextFile(path, content);
    paths.push(path);
  }

  console.log(JSON.stringify(paths));
}
