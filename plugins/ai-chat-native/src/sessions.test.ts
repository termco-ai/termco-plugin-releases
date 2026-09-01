import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  load: vi.fn<() => Promise<Record<string, unknown>>>(),
  save: vi.fn(),
  remove: vi.fn(),
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
}));

vi.mock("./runtime", () => ({
  loadSessionState: sessionState.load,
  saveSessionState: sessionState.save,
  deleteSessionDataValue: sessionState.remove,
  saveOwnedWorkspaceSnapshot: sessionState.saveSnapshot,
  loadOwnedWorkspaceSnapshot: sessionState.loadSnapshot,
}));

import {
  loadActiveByRig,
  loadSnapshot,
  saveActiveByRig,
  saveSnapshot,
} from "./sessions";

describe("current chat presentation metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.load.mockResolvedValue({});
    sessionState.loadSnapshot.mockResolvedValue(null);
  });

  it("loads only current rig navigation state", async () => {
    sessionState.load.mockResolvedValue({
      activeByRig: { "rig-a": "current" },
    });

    await expect(loadActiveByRig()).resolves.toEqual({ "rig-a": "current" });
  });

  it("does not interpret superseded navigation keys", async () => {
    sessionState.load.mockResolvedValue({
      activeBySpace: { "space-a": "old-shape" },
      activeId: "old-shape",
    });

    await expect(loadActiveByRig()).resolves.toEqual({});
  });

  it("writes only the current activeByRig key", async () => {
    await saveActiveByRig({ "rig-a": "session-a" });

    expect(sessionState.save).toHaveBeenCalledWith("activeByRig", {
      "rig-a": "session-a",
    });
  });

  it("stores workspace snapshots only as canonical checkpoint events", async () => {
    const snapshot = { tabs: [], capturedAt: 10 };
    await saveSnapshot("session-a", snapshot);
    expect(sessionState.saveSnapshot).toHaveBeenCalledWith("session-a", snapshot);

    sessionState.loadSnapshot.mockResolvedValue(snapshot);
    await expect(loadSnapshot("session-a")).resolves.toEqual(snapshot);
  });
});
