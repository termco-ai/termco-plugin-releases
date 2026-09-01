// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SshClientCapability } from "@termco/ssh-base";
import { createSshWorkspaceExecutionBackend } from "./executionBackend";

const remote = {
  kind: "ssh" as const,
  connectionId: "dev",
  host: "example.test",
};

describe("SSH workspace execution backend", () => {
  it("routes domain operations through the shared SSH client", async () => {
    const readFile = vi.fn(async () => "remote contents");
    const ssh = {
      fs: { readFile },
      shell: {},
      containers: {},
    } as unknown as SshClientCapability;
    const backend = createSshWorkspaceExecutionBackend(ssh);

    await expect(
      backend.invoke(remote, {
        domain: "files",
        method: "readFile",
        args: ["/project/readme.md"],
      }),
    ).resolves.toBe("remote contents");
    expect(readFile).toHaveBeenCalledWith(remote, "/project/readme.md");
  });
});
