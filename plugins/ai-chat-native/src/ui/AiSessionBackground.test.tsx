// @vitest-environment jsdom
import type {
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../store/store";

const sessionMocks = vi.hoisted(() => ({
  loadSnapshot: vi.fn().mockResolvedValue(null),
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sessions")>()),
  loadSnapshot: sessionMocks.loadSnapshot,
  saveSnapshot: sessionMocks.saveSnapshot,
}));

import { AiSessionBackground } from "./AiSurfaces";

function rigs(): WorkspaceRigsCapability {
  const snapshot = {
    revision: 1,
    hydrated: true,
    activeId: "default",
    rigs: [
      {
        id: "default",
        name: "Workspace",
        root: "/repo",
        workspace: { kind: "local" as const },
      },
    ],
  };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
  } as unknown as WorkspaceRigsCapability;
}

function tabs(): WorkspaceTabsCapability {
  const snapshot = {
    revision: 1,
    initialized: true,
    tabs: [
      {
        id: 1,
        rigId: "default",
        kind: "terminal",
        title: "shell",
        data: {
          cwd: "/repo",
          paneTree: { kind: "leaf", id: 2, cwd: "/repo" },
          activeLeafId: 2,
        },
      },
    ],
    activeId: 1,
    splitTabId: 0,
    focusedPane: "left" as const,
    booted: true,
    activeRigIdForNewTabs: "default",
    activeTabByRig: { default: 1 },
  };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    allocate: () => [10],
    transition: vi.fn(),
  } as unknown as WorkspaceTabsCapability;
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionMocks.loadSnapshot.mockResolvedValue(null);
  sessionMocks.saveSnapshot.mockClear();
  useChatStore.setState({
    activeSessionId: "session-1",
    currentRigId: "default",
    snapshotAvailable: false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AiSessionBackground workspace restoration", () => {
  it("captures the active rig and exposes the current restore control state", async () => {
    render(<AiSessionBackground workspaceRigs={rigs()} workspaceTabs={tabs()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(sessionMocks.saveSnapshot).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ tabs: [expect.objectContaining({ kind: "terminal" })] }),
    );
    expect(useChatStore.getState().snapshotAvailable).toBe(true);
  });

  it("does not let a stale availability read hide a newly captured snapshot", async () => {
    let resolveLoad!: (value: null) => void;
    sessionMocks.loadSnapshot.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    render(<AiSessionBackground workspaceRigs={rigs()} workspaceTabs={tabs()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(useChatStore.getState().snapshotAvailable).toBe(true);

    await act(async () => resolveLoad(null));
    expect(useChatStore.getState().snapshotAvailable).toBe(true);
  });
});
