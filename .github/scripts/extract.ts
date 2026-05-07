// Generic HTML-comment YAML frontmatter extractor.
//
// Parses every well-formed HTML-comment block in a body file (delegates
// to vsdd/frontmatter.ts for the shape rules; format-agnostic), applies
// a jq expression PER BLOCK, and writes each non-null result to a
// separate file in the output directory. Prints a JSON array of the
// written file paths to stdout — callers iterate or `jq` it.
//
// extract.ts owns the iteration: the user's `--query` runs against ONE
// block at a time. No need to prefix `.[]`; no need to chain
// `select(. != null)`. A query of `.foo.bar` writes one file per block
// that has a non-null `.foo.bar`. If you need array-level operations
// (counting blocks, cross-block joins), use jq directly — that's not
// what this tool is for.
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
//   deno run --allow-read --allow-write --allow-run extract.ts \
//     --query <jq-expr> \
//     --out-dir <dir> \
//     [--format json|yaml] \
//     [--naming index|sha|alpha] \
//     <body-file>
//
// Sample queries (per-block, no .[] prefix):
//   `.foo`                          — every block's `.foo` value (non-null)
//   `.["vsdd-tech-spec"].title`     — every tech-spec marker's title
//   `.vsdd.pretesting`              — every pretesting block (post-#214)
//   `select(.reviewer == "gemini")` — every block where reviewer is gemini
//
// Output: JSON array of file paths on stdout. Exit codes:
//   - 0 — success (zero or more matches written)
//   - 2 — usage error (missing flag, invalid value)
//   - jq's exit code — when jq fails (invalid query, etc.)

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
      "usage: extract.ts --query <jq-expr> --out-dir <dir> [--format json|yaml] [--naming index|sha|alpha] <body-file>",
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

async function jq(query: string, stdin: string): Promise<string> {
  const p = new Deno.Command("jq", {
    args: ["-c", query],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const w = p.stdin.getWriter();
  await w.write(new TextEncoder().encode(stdin));
  await w.close();
  const { stdout, stderr, code } = await p.output();
  if (code !== 0) {
    Deno.stderr.writeSync(stderr);
    Deno.exit(code);
  }
  return new TextDecoder().decode(stdout);
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

if (import.meta.main) {
  const a = args(Deno.args);

  const raw = await Deno.readTextFile(a.bodyFile);
  const blocks = parseBlocks(raw);

  // The query is evaluated per-block — extract.ts owns the iteration
  // and null-filtering so the user's expression stays focused on "what
  // do I want from a single block?". Without this wrapping, every
  // caller would write `.[] | (...) | select(. != null)` and the
  // extractor would just be jq with extra steps.
  const wrapped = `.[] | (${a.query}) | select(. != null)`;
  const out = await jq(wrapped, JSON.stringify(blocks));
  // jq -c emits one JSON value per line. Trailing newline + empty filter.
  const matches = out.split("\n").filter((l) => l.length > 0);

  await Deno.mkdir(a.outDir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const v = JSON.parse(matches[i]);
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
