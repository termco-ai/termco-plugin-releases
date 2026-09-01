import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceEnvironmentCapability,
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { createRigWorkflows } from "./workflows";

describe("workspace.rig-workflows", () => {
  it("creates a local rig from the focused terminal cwd", () => {
    const rigs = {
      snapshot: () => ({
        hydrated: true,
        activeId: "remote",
        rigs: [
          {
            id: "remote",
            name: "Remote",
            root: "/remote",
            workspace: { kind: "local" },
          },
        ],
      }),
      create: vi.fn(() => ({ id: "new-rig" })),
      activate: vi.fn(),
    } as unknown as WorkspaceRigsCapability;
    const tabs = {
      snapshot: () => ({
        tabs: [
          {
            id: 1,
            rigId: "remote",
            kind: "terminal",
            title: "shell",
            data: {
              activeLeafId: 42,
              paneTree: { kind: "leaf", id: 42, cwd: "/repo" },
            },
          },
        ],
        activeId: 1,
        splitTabId: 0,
        focusedPane: "left",
      }),
      transition: vi.fn(),
    } as unknown as WorkspaceTabsCapability;
    const environment = {
      snapshot: () => ({ home: "/home/local" }),
    } as unknown as WorkspaceEnvironmentCapability;
    const terminalSessions = {
      open: vi.fn(),
    } as unknown as TerminalSessionsCapability;
    const ssh = {} as SshClientCapability;
    const workflows = createRigWorkflows({
      rigs,
      tabs,
      environment,
      terminalSessions,
      ssh,
      notifyError: vi.fn(),
    });

    expect(workflows.createLocal()).toBe("new-rig");
    expect(rigs.create).toHaveBeenCalledWith({
      name: "Rig 2",
      root: "/repo",
      workspace: { kind: "local" },
    });
    expect(tabs.transition).toHaveBeenCalledWith({
      activeRigIdForNewTabs: "new-rig",
    });
    expect(terminalSessions.open).toHaveBeenCalledWith({
      cwd: "/repo",
      rigId: "new-rig",
    });
    expect(rigs.activate).toHaveBeenCalledWith("new-rig");
  });

  it("creates an SSH rig only after the shared SSH home resolves", async () => {
    const rigs = {
      snapshot: () => ({ hydrated: true, activeId: "local", rigs: [] }),
      create: vi.fn(() => ({ id: "ssh-rig" })),
      activate: vi.fn(),
    } as unknown as WorkspaceRigsCapability;
    const tabs = {
      transition: vi.fn(),
    } as unknown as WorkspaceTabsCapability;
    const environment = {
      snapshot: () => ({ home: "/home/local" }),
      adopt: vi.fn(async () => "/home/remote"),
    } as unknown as WorkspaceEnvironmentCapability;
    const terminalSessions = {
      open: vi.fn(),
    } as unknown as TerminalSessionsCapability;
    const ssh = {
      resolveTarget: vi.fn(() => ({
        connectionId: "dev@example.com:2222",
        host: "example.com",
        user: "dev",
        port: 2222,
      })),
      resolveHome: vi.fn(async () => "/home/remote"),
    } as unknown as SshClientCapability;
    const notifyError = vi.fn();
    const workflows = createRigWorkflows({
      rigs,
      tabs,
      environment,
      terminalSessions,
      ssh,
      notifyError,
    });

    await expect(workflows.createSsh("dev@example.com:2222")).resolves.toBe(
      "ssh-rig",
    );
    const remote = {
      kind: "ssh",
      connectionId: "dev@example.com:2222",
      host: "example.com",
      user: "dev",
      port: 2222,
    };
    expect(ssh.resolveHome).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "dev@example.com:2222" }),
    );
    expect(environment.adopt).toHaveBeenCalledWith(remote);
    expect(rigs.create).toHaveBeenCalledWith({
      name: "dev@example.com:2222",
      root: "/home/remote",
      workspace: remote,
    });
    expect(tabs.transition).toHaveBeenCalledWith({
      activeRigIdForNewTabs: "ssh-rig",
    });
    expect(terminalSessions.open).toHaveBeenCalledWith({
      cwd: "/home/remote",
      rigId: "ssh-rig",
    });
    expect(rigs.activate).toHaveBeenCalledWith("ssh-rig");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("removes a rig and creates one cold fallback terminal when needed", () => {
    let activeId = "removed";
    const rigs = {
      snapshot: () => ({
        hydrated: true,
        activeId,
        rigs: [
          { id: "removed", root: "/old", workspace: { kind: "local" } },
          { id: "fallback", root: "/work", workspace: { kind: "local" } },
        ],
      }),
      remove: vi.fn(() => {
        activeId = "fallback";
      }),
    } as unknown as WorkspaceRigsCapability;
    const transition = vi.fn();
    const tabs = {
      snapshot: () => ({
        tabs: [
          {
            id: 1,
            rigId: "removed",
            kind: "terminal",
            title: "shell",
            data: {
              paneTree: {
                kind: "split",
                first: { kind: "leaf", id: 10 },
                second: { kind: "leaf", id: 11 },
              },
            },
          },
        ],
        activeId: 1,
        splitTabId: 0,
        focusedPane: "left",
      }),
      allocate: vi.fn(() => [100, 101]),
      transition,
      deleteLayout: vi.fn(async () => {}),
    } as unknown as WorkspaceTabsCapability;
    const terminalSessions = {
      dispose: vi.fn(),
    } as unknown as TerminalSessionsCapability;
    const workflows = createRigWorkflows({
      rigs,
      tabs,
      environment: {} as WorkspaceEnvironmentCapability,
      terminalSessions,
      ssh: {} as SshClientCapability,
      notifyError: vi.fn(),
    });

    workflows.remove("removed");

    expect(rigs.remove).toHaveBeenCalledWith("removed");
    expect(tabs.deleteLayout).toHaveBeenCalledWith("removed");
    expect(transition).toHaveBeenCalledWith({
      tabs: [
        {
          id: 100,
          rigId: "fallback",
          kind: "terminal",
          title: "work",
          cold: true,
          data: {
            cwd: "/work",
            paneTree: { kind: "leaf", id: 101, cwd: "/work" },
            activeLeafId: 101,
          },
        },
      ],
      activeId: 100,
    });
    expect(terminalSessions.dispose).toHaveBeenCalledWith(10);
    expect(terminalSessions.dispose).toHaveBeenCalledWith(11);
  });
});

it("opens raw terminal tabs and rigs through legacy actions", () => {
  const rigs = {
    snapshot: () => ({
      hydrated: true,
      activeId: "default",
      rigs: [
        {
          id: "default",
          name: "Default",
          root: "/repo",
          workspace: { kind: "local" },
        },
      ],
    }),
    create: vi.fn(() => ({ id: "new-rig" })),
    activate: vi.fn(),
  } as unknown as WorkspaceRigsCapability;
  const tabs = {
    snapshot: () => ({
      tabs: [
        {
          id: 1,
          rigId: "default",
          kind: "terminal",
          title: "shell",
          data: { activeLeafId: 10, paneTree: { kind: "leaf", id: 10 } },
        },
      ],
      activeId: 1,
      splitTabId: 0,
      focusedPane: "left",
    }),
    transition: vi.fn(),
  } as unknown as WorkspaceTabsCapability;
  const terminalSessions = { open: vi.fn() } as unknown as TerminalSessionsCapability;
  const workflows = createRigWorkflows({
    rigs,
    tabs,
    terminalSessions,
    environment: {
      snapshot: () => ({ home: "/home/test" }),
    } as unknown as WorkspaceEnvironmentCapability,
    ssh: {} as SshClientCapability,
    notifyError: vi.fn(),
  });

  expect(workflows.createLocal()).toBe("new-rig");
  expect(rigs.create).toHaveBeenCalledWith(
    expect.objectContaining({ workspace: { kind: "local" } }),
  );
  expect(terminalSessions.open).toHaveBeenCalledWith({
    rigId: "new-rig",
  });
  expect(rigs.activate).toHaveBeenCalledWith("new-rig");
});
