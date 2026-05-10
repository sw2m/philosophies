// Directory-backed cross-step kv with dot-delimited namespacing.
// Namespaces map to subdirectories of $GITHUB_SHARED_DIR.
//
// Usage:
//   shared.set("steps.producer", "val", "hello");
//   shared.get("steps.producer", "val");       // "hello"
//   shared.list("steps.producer");              // ["val"]
//   shared.set("global", "memory", content);    // top-level namespace

function dir(): string {
  return Deno.env.get("GITHUB_SHARED_DIR")
    ?? `${Deno.env.get("RUNNER_TEMP") ?? "/tmp"}/shared`;
}

function resolve(ns: string): string {
  return `${dir()}/${ns.replaceAll(".", "/")}`;
}

export async function get(ns: string, name: string): Promise<string | undefined> {
  try { return await Deno.readTextFile(`${resolve(ns)}/${name}`); }
  catch { return undefined; }
}

export async function set(ns: string, name: string, value: string): Promise<void> {
  const d = resolve(ns);
  await Deno.mkdir(d, { recursive: true });
  await Deno.writeTextFile(`${d}/${name}`, value);
}

export async function list(ns: string): Promise<string[]> {
  try {
    const out: string[] = [];
    for await (const e of Deno.readDir(resolve(ns))) {
      if (e.isFile) out.push(e.name);
    }
    return out.sort();
  } catch { return []; }
}
