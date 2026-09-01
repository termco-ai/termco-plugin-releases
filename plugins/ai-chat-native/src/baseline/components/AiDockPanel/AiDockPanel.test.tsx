// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../../store/chatStore";
import {
  DOCK_MODES,
  RestoreWorkspaceButton,
  resolvedDockModes,
} from "./AiDockPanel";
import { WORKSPACE_RESTORE_EVENT } from "../../lib/useWorkspaceSnapshot";

afterEach(cleanup);

describe("current dock controls", () => {
  it("keeps the original lowercase mode labels", () => {
    expect(DOCK_MODES.map(({ label }) => label)).toEqual([
      "chat",
      "agents",
      "workflows",
    ]);
  });

  it("keeps default contribution casing stable but exposes replacement labels", () => {
    expect(
      resolvedDockModes({
        agents: "Agents",
        workflows: "E2E Workflows",
      }).map(({ label }) => label),
    ).toEqual(["chat", "agents", "E2E Workflows"]);
  });

  it("shows and dispatches Restore workspace when a snapshot is available", () => {
    useChatStore.setState({ snapshotAvailable: true });
    const restore = vi.fn();
    window.addEventListener(WORKSPACE_RESTORE_EVENT, restore);
    render(<RestoreWorkspaceButton />);

    fireEvent.click(screen.getByRole("button", { name: "Restore workspace" }));
    expect(restore).toHaveBeenCalledOnce();
    window.removeEventListener(WORKSPACE_RESTORE_EVENT, restore);
  });
});
