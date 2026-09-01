// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SourceControlPanel } from "./SourceControlPanelLazy";
import type { SourceControlSummary } from "./useSourceControl";

vi.mock("./SourceControlPanel", () => ({
  SourceControlPanel: ({ open }: { open: boolean }) => (
    <div data-testid="inner-panel">{open ? "open" : "closed"}</div>
  ),
}));

function makeSummary(): SourceControlSummary {
  return {
    repo: null,
    status: null,
    changedCount: 0,
    upstream: null,
    ahead: 0,
    behind: 0,
    hasRepo: false,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
    applyStatus: vi.fn(),
    refresh: vi.fn(async () => {}),
    runRemoteAction: vi.fn(async () => ({ ok: false, action: null })),
  };
}

describe("SourceControlPanel (lazy)", () => {
  it("loads the inner panel and forwards props", async () => {
    render(
      <SourceControlPanel
        open
        sourceControl={makeSummary()}
        onOpenDiff={vi.fn()}
      />,
    );
    expect(await screen.findByTestId("inner-panel")).toHaveTextContent("open");
  });
});
