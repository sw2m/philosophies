#!/usr/bin/env -S deno run
// Step 0 — empty-input bypass + canonical JSON parse.
//
// Reads `{proposed, existing}` JSON from stdin, writes a JSON envelope to
// stdout. Malformed JSON / missing fields hard-fail HERE — this is the
// canonical parse point per the tech-spec.
//
// Permissions required: none (stdin/stdout don't need explicit perms).

import { detectBypass } from "./lib.ts";

const raw = await new Response(Deno.stdin.readable).text();
let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`::error::is-empty.ts: input is not valid JSON: ${(err as Error).message}`);
  Deno.exit(2);
}

let result;
try {
  result = detectBypass(parsed);
} catch (err) {
  console.error(`::error::is-empty.ts: ${(err as Error).message}`);
  Deno.exit(2);
}

await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(result)));
