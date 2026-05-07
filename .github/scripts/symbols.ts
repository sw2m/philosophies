// Cached parsed export of `.github/assets/symbols.yaml`. Loads the YAML once
// at module-load time and exposes it as `SYMBOLS`. The YAML is the only
// source of truth — this module deliberately holds no shape assertions,
// no required-key lists, no convenience views. Anything that mirrors the
// YAML's structure here would be drift bait.
//
// If the YAML is malformed, `jsr:@std/yaml` throws a parse error at
// import time. If a consumer accesses a key that doesn't exist, the
// resulting `undefined` access fails at the call site — fix the YAML.
//
// Python / bash / non-Deno consumers parse the YAML themselves via
// `yq` / `pyyaml` / etc. — they don't go through this module.

import { parse } from "jsr:@std/yaml@^1";

const path = new URL("../assets/symbols.yaml", import.meta.url);
// deno-lint-ignore no-explicit-any
export const SYMBOLS: any = parse(await Deno.readTextFile(path));
