// @vitest-environment jsdom
import type { Tab } from "../../../tabTypes";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../GitHistoryPane", () => ({
  GitHistoryPane: ({ repoRoot }: { repoRoot: string }) => (
    <div data-testid="pane">{repoRoot}</div>
  ),
}));

import { GitHistoryStack } from "./GitHistoryStack";

afterEach(() => {
  cleanup();
});

const historyTab = {
  id: 3,
  kind: "git-history",
  title: "History",
  repoRoot: "/repo",
  rigId: "default",
} as unknown as Tab;

const terminalTab = {
  id: 3,
  kind: "terminal",
  title: "shell",
  rigId: "default",
} as unknown as Tab;

describe("GitHistoryStack", () => {
  it("renders the pane for the active git-history tab", () => {
    render(
      <GitHistoryStack
        tabs={[terminalTab, historyTab]}
        activeId={3}
        onOpenCommitFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pane").textContent).toBe("/repo");
  });

  it("renders nothing when the active tab is not git-history", () => {
    const { container } = render(
      <GitHistoryStack
        tabs={[terminalTab]}
        activeId={3}
        onOpenCommitFile={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the active id matches no tab", () => {
    const { container } = render(
      <GitHistoryStack
        tabs={[historyTab]}
        activeId={99}
        onOpenCommitFile={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
