// @vitest-environment node
import { expect, it } from "vitest";
import { runCommand } from "./oneshot";
const LOCAL = { kind: "local" as const };
it("cancels an in-flight shell command before its child can write later", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "termco-shell-cancel-"));
  try {
    const controller = new AbortController();
    const running = runCommand("sleep 0.2; printf late > mutation.txt", dir, 5, LOCAL, controller.signal);
    controller.abort(new Error("cancelled"));
    const result = await running;
    expect(result.exit_code).not.toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(readFile(join(dir, "mutation.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
