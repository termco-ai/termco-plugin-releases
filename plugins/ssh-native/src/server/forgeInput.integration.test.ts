// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ directory: "" }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: null, output: string) => void) => {
    queueMicrotask(() => callback(null, fixture.directory));
    return new EventEmitter();
  },
}));
import { forgeRun } from "./forge";

it.skipIf(process.platform === "win32")("survives real early child exit in the SSH runner", async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), "termco-forge-input-"));
  try {
    // The Node binary rejects these valid gh arguments before reading stdin.
    await symlink(process.execPath, join(fixture.directory, "gh"));
    const result = await forgeRun({
      executable: "gh", refreshExecutable: true,
      args: ["api", "--hostname", "github.com", "--method", "POST", "repos/team/app/pulls/42/reviews", "--input", "-"],
      stdin: JSON.stringify({ commit_id: "a".repeat(40), event: "COMMENT", comments: Array.from({ length: 40 }, () => ({ path: "a.ts", line: 1, side: "RIGHT", body: "x".repeat(30000) })) }),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toMatch(/EPIPE|ECONNRESET/);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
