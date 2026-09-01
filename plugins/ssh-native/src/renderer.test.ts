import type { ProcessTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererSshCapability } from "./renderer";

function transport(call: ProcessTransport["call"]): ProcessTransport {
  return {
    call,
    registerChannel: vi.fn(),
    releaseChannel: vi.fn(),
    releaseRemote: vi.fn(async () => undefined),
  };
}

describe("SSH renderer bridge", () => {
  it("routes connect and disconnect while preserving reconnect errors", async () => {
    const error = new Error("reconnect rejected");
    const call = vi.fn(async (_service, method) => {
      if (method === "connect") throw error;
      return undefined;
    });
    const ssh = createRendererSshCapability(transport(call));
    const target = ssh.resolveTarget({ connectionId: "dev@example.test:2222" });

    await expect(ssh.connect(target)).rejects.toBe(error);
    await expect(ssh.disconnect(target.connectionId)).resolves.toBeUndefined();
    expect(call).toHaveBeenNthCalledWith(1, "ssh.client", "connect", [target]);
    expect(call).toHaveBeenNthCalledWith(2, "ssh.client", "disconnect", [
      target.connectionId,
    ]);
  });

  it("keeps renderer-safe helpers local without a subscription round trip", () => {
    const call = vi.fn(async () => undefined);
    const ssh = createRendererSshCapability(transport(call));
    const workspace = {
      kind: "ssh" as const,
      connectionId: "dev",
      host: "example.test",
    };

    expect(ssh.isWorkspace(workspace)).toBe(true);
    expect(ssh.ok({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      spawnError: false,
    })).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
});
