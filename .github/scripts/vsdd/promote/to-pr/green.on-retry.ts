export default async function(_attempt: number, _lastError: string): Promise<void> {
  const sg = git();
  await sg.stash(["--include-untracked"]);
  try { await sg.stash(["drop"]); } catch {}
}
