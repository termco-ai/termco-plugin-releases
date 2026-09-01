// @vitest-environment jsdom
import type { UiAiDockRuntime } from "@termco/ui-dock-base";
import type { WorkflowDefinition, WorkflowsLibraryCapability } from "@termco/workflows-base";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanel } from "./renderer";

afterEach(cleanup);

const status: WorkflowDefinition = {
  id: "git-status",
  name: "Status (short)",
  description: "Working tree status, compact",
  command: "git status -sb",
  parameters: [],
  tags: ["git"],
  target: { kind: "focused_terminal" },
  source: "builtin",
};

function library(): WorkflowsLibraryCapability {
  const snapshot = { revision: 1, favoriteIds: [] };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    visible: () => [status],
    isFavorite: () => false,
  } as unknown as WorkflowsLibraryCapability;
}

describe("current workflow list", () => {
  it("keeps the original search, category, command row, and run treatment", () => {
    const Panel = createPanel(library(), {
      open: vi.fn(),
    } as never);
    render(
      <Panel
        runtime={
          {
            activeRigId: "default",
            activeRigName: "Workspace",
            cwd: "/repo",
            workspace: { kind: "local" },
          } as UiAiDockRuntime
        }
      />,
    );

    expect(screen.getByPlaceholderText("Search workflows")).toBeDefined();
    expect(screen.getByRole("button", { name: "All" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "All 1" })).toBeNull();
    expect(screen.getByText("git status -sb")).toBeDefined();
    expect(screen.queryByText("Working tree status, compact")).toBeNull();
    expect(screen.getByRole("button", { name: "Run Status (short)" })).toBeDefined();
  });
});
