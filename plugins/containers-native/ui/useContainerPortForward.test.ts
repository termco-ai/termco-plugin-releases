// @vitest-environment jsdom
import type { BrowserTabsCapability } from "@termco/browser-base";
import type { SshClientCapability } from "@termco/ssh-base";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureContainerIntegrations } from "./lib/integrations";
import { setContainersWorkspace } from "./lib/native";

const forwardAdd = vi.fn(async (_id: string, input: { localPort: number | "auto"; remotePort: number }) => ({
  id: "f1", connectionId: "conn1", localPort: input.localPort === "auto" ? 49213 : input.localPort,
  remoteHost: "127.0.0.1", remotePort: input.remotePort, state: "active" as const, error: null, desired: "running" as const,
}));
const forwardList = vi.fn(async () => []);
const forwardEnsure = vi.fn(async () => []);
const forwardRemove = vi.fn(async () => {});
const open = vi.fn(() => 1);
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useContainerPortForward } from "./useContainerPortForward";

function setup(kind: "local" | "ssh") {
  setContainersWorkspace(kind === "ssh" ? { kind: "ssh", connectionId: "conn1", host: "host" } : { kind: "local" });
  configureContainerIntegrations({
    ssh: { forwardAdd, forwardList, forwardEnsure, forwardRemove } as unknown as SshClientCapability,
    browser: { open } as unknown as BrowserTabsCapability,
    tabs: null,
  });
  return renderHook(() => useContainerPortForward()).result;
}

afterEach(() => { vi.clearAllMocks(); });

describe("useContainerPortForward", () => {
  it("opens a local published port without creating a forward", async () => {
    const result = setup("local");
    await result.current.route(8080, "same");
    expect(open).toHaveBeenCalledWith("http://localhost:8080");
    expect(forwardAdd).not.toHaveBeenCalled();
  });

  it("creates same-port and custom SSH forwards", async () => {
    const result = setup("ssh");
    await result.current.route(8080, "same");
    await result.current.route(5432, 15432);
    expect(forwardAdd).toHaveBeenNthCalledWith(1, "conn1", { localPort: 8080, remotePort: 8080 });
    expect(forwardAdd).toHaveBeenNthCalledWith(2, "conn1", { localPort: 15432, remotePort: 5432 });
  });

  it("falls back to an automatically allocated port", async () => {
    forwardAdd.mockRejectedValueOnce(new Error("busy"));
    const result = setup("ssh");
    await result.current.route(8080, "same");
    expect(forwardAdd).toHaveBeenLastCalledWith("conn1", { localPort: "auto", remotePort: 8080 });
  });

  it("removes a shared forward", () => {
    const result = setup("ssh");
    result.current.stop("f1");
    expect(forwardRemove).toHaveBeenCalledWith("f1");
  });
});
