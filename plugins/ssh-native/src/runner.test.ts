import { describe, expect, it, vi } from "vitest";

const runCli = vi.hoisted(() => vi.fn(async () => ({ exitCode: 0 })));
vi.mock("./cliRunner", () => ({ runCli, ok: () => true }));
import { runScp, runSsh } from "./runner";

describe("SSH password authentication", () => {
  it("allows OpenSSH to request credentials for commands and uploads", async () => {
    const target = { connectionId: "password-host", host: "password-host" };
    await runSsh(target, "echo ready");
    await runScp(target, "/tmp/bundle", "bundle");
    for (const call of runCli.mock.calls as unknown as Array<[string, string[]]>) {
      expect(call[1]).not.toContain("BatchMode=yes");
    }
  });
});
