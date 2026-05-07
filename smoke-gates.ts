// Verify gates.ts dispatch works by invoking with bad arg → exit 2.
// Cannot test full retry loop without claude CLI + git repo; CI handles that.

const proc = new Deno.Command(Deno.execPath(), {
  args: ["run", "--allow-read", ".github/scripts/vsdd/promote/gates.ts", "bogus"],
  stdout: "piped", stderr: "piped",
}).spawn();
const { code } = await proc.status;
console.log(`exit code: ${code} (expected: 2)`);
if (code !== 2) Deno.exit(1);
console.log("PASS");
