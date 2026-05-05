#!/usr/bin/env -S deno run
// Step 1 — render the agent prompt.
//
// Reads `{proposed, existing}` JSON from stdin, writes the rendered prompt
// text to the file path passed as Deno.args[0]. Hard-fails if the rendered
// text exceeds the MAX_BYTES env var (parsed as int).
//
// Permissions required:
//   --allow-env=MAX_BYTES   (read the size ceiling)
//   --allow-write=<output>  (write the rendered prompt file)

import { renderPrompt } from "./lib.ts";

const outFile = Deno.args[0];
if (!outFile) {
  console.error("::error::render-input.ts: usage: render-input.ts <output-file>");
  Deno.exit(2);
}

const maxBytesRaw = Deno.env.get("MAX_BYTES");
const maxBytes = maxBytesRaw ? parseInt(maxBytesRaw, 10) : undefined;
if (maxBytesRaw && (Number.isNaN(maxBytes) || (maxBytes ?? 0) <= 0)) {
  console.error(`::error::render-input.ts: MAX_BYTES env var must be a positive integer, got ${JSON.stringify(maxBytesRaw)}`);
  Deno.exit(2);
}

const raw = await new Response(Deno.stdin.readable).text();
const input = JSON.parse(raw);

let result;
try {
  result = renderPrompt(input, maxBytes);
} catch (err) {
  console.error(`::error::render-input.ts: ${(err as Error).message}`);
  Deno.exit(1);
}

Deno.writeTextFileSync(outFile, result.text);
console.log(`render-input: wrote ${result.bytes} bytes to ${outFile}`);
