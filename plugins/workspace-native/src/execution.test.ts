// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WorkspaceExecutionBackend } from "@termco/workspace-base";
import {
  createWorkspaceExecutionBackendRegistry,
  createWorkspaceExecutionCapability,
} from "./execution";

const localWorkspace = { kind: "local" } as const;
const remoteWorkspace = {
  kind: "ssh" as const,
  connectionId: "production",
  host: "example.test",
};

function backend(
  id: string,
  kind: WorkspaceExecutionBackend["kind"],
  result: unknown,
): WorkspaceExecutionBackend {
  return {
    id,
    kind,
    label: id,
    priority: 100,
    status: () => ({ available: true }),
    async invoke<T>() {
      return result as T;
    },
  };
}

describe("workspace execution", () => {
  it("keeps local execution available while an SSH backend leaves and returns", async () => {
    const registry = createWorkspaceExecutionBackendRegistry();
    const execution = createWorkspaceExecutionCapability(registry);
    const local = backend("local", "local", "local-result");
    const ssh = backend("ssh", "ssh", "remote-result");
    registry.register(local);
    const removeSsh = registry.register(ssh);

    await expect(
      execution.invoke(localWorkspace, { domain: "shell", method: "run", args: [] }),
    ).resolves.toBe("local-result");
    await expect(
      execution.invoke(remoteWorkspace, { domain: "shell", method: "run", args: [] }),
    ).resolves.toBe("remote-result");

    removeSsh();

    expect(execution.availability(localWorkspace)).toEqual({
      available: true,
      backendId: "local",
      label: "local",
    });
    expect(execution.availability(remoteWorkspace)).toEqual({
      available: false,
      code: "workspace-execution-unavailable",
      workspaceKind: "ssh",
      reason: "No SSH execution backend is active.",
    });
    await expect(
      execution.invoke(remoteWorkspace, { domain: "shell", method: "run", args: [] }),
    ).rejects.toMatchObject({
      name: "WorkspaceExecutionUnavailable",
      code: "workspace-execution-unavailable",
      workspaceKind: "ssh",
    });
    await expect(
      execution.invoke(localWorkspace, { domain: "shell", method: "run", args: [] }),
    ).resolves.toBe("local-result");

    registry.register(ssh);
    await expect(
      execution.invoke(remoteWorkspace, { domain: "shell", method: "run", args: [] }),
    ).resolves.toBe("remote-result");
  });
});
