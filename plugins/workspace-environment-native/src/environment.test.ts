import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceCapability,
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceEnvironmentCapability } from "./environment";

function dependencies() {
  const workspace = {
    homeDir: vi.fn(() => "/home/local"),
    currentDir: vi.fn(() => "/launch"),
    authorize: vi.fn((path: string) => path),
    listWslDistros: vi.fn(() => []),
    wslHome: vi.fn(() => "/home/wsl"),
  } as unknown as WorkspaceCapability;
  const ssh = {
    resolveHome: vi.fn(async () => "/home/ssh"),
  } as unknown as SshClientCapability;
  const rigs = {
    snapshot: vi.fn(() => ({ hydrated: true, activeId: "rig-a", rigs: [] })),
    setWorkspace: vi.fn(),
  } as unknown as WorkspaceRigsCapability;
  const tabs = {
    snapshot: vi.fn(() => ({ tabs: [] })),
  } as unknown as WorkspaceTabsCapability;
  const terminalSessions = {
    reset: vi.fn(() => ({ tabId: 10, leafId: 11 })),
  } as unknown as TerminalSessionsCapability;
  const alert = vi.fn();
  return { workspace, ssh, rigs, tabs, terminalSessions, alert };
}

describe("workspace.environment", () => {
  it("mirrors a successful switch onto the active rig", async () => {
    const deps = dependencies();
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(
      environment.switch({ kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toBe(true);

    expect(deps.rigs.setWorkspace).toHaveBeenCalledWith(
      "rig-a",
      { kind: "wsl", distro: "Ubuntu" },
      "/home/wsl",
    );
  });

  it("does not mirror when the switch was refused", async () => {
    const deps = dependencies();
    vi.mocked(deps.tabs.snapshot).mockReturnValue({
      tabs: [
        {
          id: 1,
          rigId: "rig-a",
          kind: "editor",
          title: "dirty.ts",
          data: { dirty: true },
        },
      ],
    } as unknown as ReturnType<WorkspaceTabsCapability["snapshot"]>);
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(
      environment.switch({ kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toBe(false);

    expect(deps.rigs.setWorkspace).not.toHaveBeenCalled();
  });

  it("does not mirror without an active rig", async () => {
    const deps = dependencies();
    vi.mocked(deps.rigs.snapshot).mockReturnValue({
      hydrated: true,
      activeId: null,
      rigs: [],
    });
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(
      environment.switch({ kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toBe(true);

    expect(deps.rigs.setWorkspace).not.toHaveBeenCalled();
    expect(deps.terminalSessions.reset).toHaveBeenCalledWith({
      cwd: "/home/wsl",
    });
  });

  it("switches the active rig to WSL through one shared transition", async () => {
    const deps = dependencies();
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(
      environment.switch({ kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toBe(true);
    expect(environment.snapshot()).toMatchObject({
      workspace: { kind: "wsl", distro: "Ubuntu" },
      home: "/home/wsl",
      launchCwd: "/home/wsl",
      launchCwdResolved: true,
    });
    expect(deps.workspace.authorize).toHaveBeenCalledWith("/home/wsl", {
      kind: "wsl",
      distro: "Ubuntu",
    });
    expect(deps.terminalSessions.reset).toHaveBeenCalledWith({
      cwd: "/home/wsl",
      rigId: "rig-a",
    });
    expect(deps.rigs.setWorkspace).toHaveBeenCalledWith(
      "rig-a",
      { kind: "wsl", distro: "Ubuntu" },
      "/home/wsl",
    );
  });

  it("preserves the current workspace when an editor has unsaved changes", async () => {
    const deps = dependencies();
    vi.mocked(deps.tabs.snapshot).mockReturnValue({
      tabs: [
        {
          id: 1,
          rigId: "rig-a",
          kind: "editor",
          title: "dirty.ts",
          data: { dirty: true },
        },
      ],
    } as unknown as ReturnType<WorkspaceTabsCapability["snapshot"]>);
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(
      environment.switch({ kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toBe(false);
    expect(environment.snapshot().workspace).toEqual({ kind: "local" });
    expect(deps.alert).toHaveBeenCalledWith(
      "Save or close unsaved editor tabs before switching workspace.",
    );
    expect(deps.terminalSessions.reset).not.toHaveBeenCalled();
    expect(deps.rigs.setWorkspace).not.toHaveBeenCalled();
  });

  it("drops a stale SSH home result after a newer rig environment wins", async () => {
    const deps = dependencies();
    let resolveFirst!: (home: string) => void;
    vi.mocked(deps.ssh.resolveHome).mockImplementation(async (target) => {
      if (target.connectionId === "first") {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return "/home/second";
    });
    const environment = await createWorkspaceEnvironmentCapability(deps);
    const first = environment.adopt({
      kind: "ssh",
      connectionId: "first",
      host: "first",
    });
    const secondWorkspace = {
      kind: "ssh" as const,
      connectionId: "second",
      host: "second",
    };

    await expect(environment.adopt(secondWorkspace)).resolves.toBe(
      "/home/second",
    );
    resolveFirst("/home/first");
    await expect(first).resolves.toBeNull();
    expect(environment.snapshot()).toMatchObject({
      workspace: secondWorkspace,
      home: "/home/second",
      launchCwd: "/home/second",
    });
    expect(deps.workspace.authorize).not.toHaveBeenCalledWith(
      "/home/first",
      expect.anything(),
    );
  });

  it("publishes WSL discovery progress and normalizes discovery failures", async () => {
    const deps = dependencies();
    vi.mocked(deps.workspace.listWslDistros)
      .mockReturnValueOnce([
        { name: "Ubuntu", default: true, running: true },
      ])
      .mockImplementationOnce(() => {
        throw new Error("wsl unavailable");
      });
    const environment = await createWorkspaceEnvironmentCapability(deps);

    await expect(environment.refreshWslDistros()).resolves.toEqual([
      { name: "Ubuntu", default: true, running: true },
    ]);
    expect(environment.snapshot()).toMatchObject({
      wslDistros: [{ name: "Ubuntu", default: true, running: true }],
      wslLoading: false,
      wslError: null,
    });
    await expect(environment.refreshWslDistros()).resolves.toEqual([]);
    expect(environment.snapshot()).toMatchObject({
      wslDistros: [],
      wslLoading: false,
      wslError: "Error: wsl unavailable",
    });
  });
});

it("disposes every pane-tree session and clears every pane handle map", async () => {
  const deps = dependencies();
  const environment = await createWorkspaceEnvironmentCapability(deps);

  await expect(
    environment.switch({ kind: "wsl", distro: "Ubuntu" }),
  ).resolves.toBe(true);

  expect(deps.terminalSessions.reset).toHaveBeenCalledExactlyOnceWith({
    cwd: "/home/wsl",
    rigId: "rig-a",
  });
});
