// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { TooltipProvider } from "@termco/ui";
import type { GitStatusSnapshot } from "@termco/git-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PanelHeader } from "./PanelHeader";

vi.mock("../../runtime", () => ({
  native: {
    gitListBranches: vi.fn(async () => ({ branches: [] })),
    gitCheckoutBranch: vi.fn(async () => {}),
  },
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

function status(overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
    ...overrides,
  };
}

type Props = ComponentProps<typeof PanelHeader>;

function renderHeader(overrides: Partial<Props> = {}) {
  const props: Props = {
    repoRoot: "/repo",
    status: status(),
    repoLabel: "main",
    actionBusy: null,
    isRefreshing: false,
    refreshAnimating: false,
    canFetch: true,
    canPull: true,
    fetchBusy: false,
    pullBusy: false,
    hasUpstream: true,
    isDiverged: false,
    onRefresh: vi.fn(),
    onFetch: vi.fn(),
    onPull: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <PanelHeader {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("PanelHeader", () => {
  it("shows the repo label in the branch dropdown trigger", () => {
    renderHeader();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("shows ahead and behind badges only when nonzero", () => {
    renderHeader({ status: status({ ahead: 2, behind: 1 }) });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    cleanup();
    renderHeader();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks a detached head", () => {
    renderHeader({ status: status({ isDetached: true }) });
    expect(screen.getByText("detached")).toBeInTheDocument();
  });

  it("fetches from the remote", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Fetch from remote" }));
    expect(props.onFetch).toHaveBeenCalled();
  });

  it("disables fetch and shows progress while fetching", () => {
    renderHeader({ canFetch: false, fetchBusy: true });
    expect(screen.getByRole("button", { name: "Fetching…" })).toBeDisabled();
  });

  it("pulls with the commit count in the label", () => {
    const props = renderHeader({ status: status({ behind: 3 }) });
    fireEvent.click(
      screen.getByRole("button", { name: "Pull 3 commits (fast-forward)" }),
    );
    expect(props.onPull).toHaveBeenCalled();
  });

  it("explains why pull is unavailable", () => {
    renderHeader({ canPull: false });
    expect(
      screen.getByRole("button", { name: "Already up to date" }),
    ).toBeDisabled();
    cleanup();
    renderHeader({ canPull: false, isDiverged: true });
    expect(
      screen.getByRole("button", { name: /Branch diverged/ }),
    ).toBeDisabled();
    cleanup();
    renderHeader({ canPull: false, hasUpstream: false });
    expect(
      screen.getByRole("button", { name: "No upstream configured" }),
    ).toBeDisabled();
    cleanup();
    renderHeader({ canPull: false, pullBusy: true });
    expect(screen.getByRole("button", { name: "Pulling…" })).toBeDisabled();
  });

  it("refreshes the panel", () => {
    const props = renderHeader();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh source control" }),
    );
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it("disables refresh while loading or busy", () => {
    renderHeader({ isRefreshing: true });
    expect(
      screen.getByRole("button", { name: "Refresh source control" }),
    ).toBeDisabled();
    cleanup();
    renderHeader({ actionBusy: "commit" });
    expect(
      screen.getByRole("button", { name: "Refresh source control" }),
    ).toBeDisabled();
  });
});
