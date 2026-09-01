// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { GitBranchEntry } from "@termco/git-base";
import { native } from "../../runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BranchDropdown } from "./BranchDropdown";

vi.mock("../../runtime", () => ({
  native: {
    gitListBranches: vi.fn(),
    gitCheckoutBranch: vi.fn(),
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
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(cleanup);

function branch(overrides: Partial<GitBranchEntry>): GitBranchEntry {
  return {
    name: "main",
    kind: "local",
    worktreePath: null,
    isHead: false,
    isDetached: false,
    ...overrides,
  };
}

const BRANCHES: GitBranchEntry[] = [
  branch({ name: "main", isHead: true }),
  branch({ name: "feature/panel" }),
  branch({
    name: "hotfix",
    kind: "worktree",
    worktreePath: "/repo-hotfix",
  }),
  branch({ name: "origin/feature-x", kind: "remote" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(native.gitListBranches).mockResolvedValue({ branches: BRANCHES });
  vi.mocked(native.gitCheckoutBranch).mockResolvedValue(undefined);
});

function renderDropdown(
  overrides: Partial<{
    repoRoot: string | null;
    onNavigateToPath: (path: string) => void;
    onRefresh: () => void;
  }> = {},
) {
  const onRefresh = overrides.onRefresh ?? vi.fn();
  const onNavigateToPath = overrides.onNavigateToPath ?? vi.fn();
  render(
    <BranchDropdown
      repoRoot={
        "repoRoot" in overrides ? (overrides.repoRoot ?? null) : "/repo"
      }
      repoLabel="main"
      onNavigateToPath={onNavigateToPath}
      onRefresh={onRefresh}
    />,
  );
  return { onRefresh, onNavigateToPath };
}

function openDropdown() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /main/ }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

describe("BranchDropdown", () => {
  it("loads and groups branches when opened", async () => {
    renderDropdown();
    openDropdown();
    expect(await screen.findByText("Local Branches")).toBeInTheDocument();
    expect(native.gitListBranches).toHaveBeenCalledWith("/repo");
    expect(screen.getByText("feature/panel")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.getByText("hotfix")).toBeInTheDocument();
    expect(screen.getByText("/repo-hotfix")).toBeInTheDocument();
  });

  it("shows remote-only branches in their own group", async () => {
    renderDropdown();
    openDropdown();
    expect(await screen.findByText("Remote Branches")).toBeInTheDocument();
    expect(screen.getByText("origin/feature-x")).toBeInTheDocument();
  });

  it("checks out a remote branch by its qualified name", async () => {
    const { onRefresh } = renderDropdown();
    openDropdown();
    fireEvent.click(await screen.findByText("origin/feature-x"));
    await waitFor(() => {
      // The backend turns this into a local tracking branch.
      expect(native.gitCheckoutBranch).toHaveBeenCalledWith(
        "/repo",
        "origin/feature-x",
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("searches across remote branches too", async () => {
    renderDropdown();
    openDropdown();
    fireEvent.change(await screen.findByPlaceholderText(/Find branch/), {
      target: { value: "feature-x" },
    });
    expect(screen.getByText("origin/feature-x")).toBeInTheDocument();
    expect(screen.queryByText("feature/panel")).not.toBeInTheDocument();
  });

  it("checks out a branch and refreshes", async () => {
    const { onRefresh } = renderDropdown();
    openDropdown();
    fireEvent.click(await screen.findByText("feature/panel"));
    await waitFor(() => {
      expect(native.gitCheckoutBranch).toHaveBeenCalledWith(
        "/repo",
        "feature/panel",
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("reports checkout failures as a toast", async () => {
    vi.mocked(native.gitCheckoutBranch).mockRejectedValue("checkout failed");
    const { onRefresh } = renderDropdown();
    openDropdown();
    fireEvent.click(await screen.findByText("feature/panel"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("checkout failed");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("navigates to a worktree path", async () => {
    const { onNavigateToPath } = renderDropdown();
    openDropdown();
    fireEvent.click(await screen.findByText("hotfix"));
    expect(onNavigateToPath).toHaveBeenCalledWith("/repo-hotfix");
    expect(native.gitCheckoutBranch).not.toHaveBeenCalled();
  });

  it("shows the load error inside the menu", async () => {
    vi.mocked(native.gitListBranches).mockRejectedValue("not a repo");
    renderDropdown();
    openDropdown();
    expect(await screen.findByText("not a repo")).toBeInTheDocument();
  });

  it("shows an empty state without branches", async () => {
    vi.mocked(native.gitListBranches).mockResolvedValue({ branches: [] });
    renderDropdown();
    openDropdown();
    expect(await screen.findByText("No branches found.")).toBeInTheDocument();
  });

  it("skips loading without a repo root", async () => {
    renderDropdown({ repoRoot: null });
    openDropdown();
    expect(await screen.findByText("No branches found.")).toBeInTheDocument();
    expect(native.gitListBranches).not.toHaveBeenCalled();
  });
});
