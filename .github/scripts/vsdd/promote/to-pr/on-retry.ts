export default async function(_attempt: number, _lastError: string): Promise<void> {
  const sg = git();
  await sg.checkout(["--", "."]);
  await sg.clean("f", ["-d"]);
}
