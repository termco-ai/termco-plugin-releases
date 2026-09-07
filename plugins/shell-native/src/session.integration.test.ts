// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { sessionOpen, sessionRun, sessionClose } from "./session";

it("closing a running session stops its child mutations before execution settles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "termco-session-cancel-"));
  const id = sessionOpen(directory, { kind: "local" });
  try {
    const running = sessionRun(id, "sleep 0.2; printf late > mutation.txt", directory, 5, { kind: "local" });
    sessionClose(id);
    expect((await running).exit_code).not.toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(readFile(join(directory, "mutation.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(sessionRun(id, "true", directory, 5, { kind: "local" })).rejects.toThrow("closed");
  } finally { sessionClose(id); await rm(directory, { recursive: true, force: true }); }
});
