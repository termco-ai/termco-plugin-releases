// @vitest-environment jsdom
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type { UiWorkspaceComposerCapability } from "@termco/ui-workspace-base";
import type { WorkspaceEnvironmentCapability, WorkspaceTabsCapability } from "@termco/workspace-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceFooterContribution } from "./WorkspaceFooter";

vi.mock("../terminal/block/ShellInput", () => ({
  default: () => <div data-testid="shell-input" />,
}));
vi.mock("../terminal/lib/blockController", () => ({
  useBlockController: (leafId: number | null) =>
    leafId === null
      ? null
      : {
          blockMode: "prompt",
          submitCommand: vi.fn(),
          interrupt: vi.fn(),
          getCwd: () => "/repo",
        },
}));
vi.mock("../terminal/lib/useTerminalSession", () => ({
  focusLeafInput: vi.fn(),
}));
vi.mock("../gitBranch", () => ({ useGitBranch: () => "feature" }));
vi.mock("../runtime", () => ({
  terminalRuntime: () => ({ pty: { shellName: () => "zsh" } }),
}));

const themeSnapshot = {
  resolvedMode: "dark",
  themeId: "termco-default",
  customThemeIds: [],
};
const theme = {
  subscribe: () => () => {},
  snapshot: () => themeSnapshot,
} as unknown as UiThemeCapability;
const environmentSnapshot = {
  workspace: { kind: "local" as const },
  home: "/home/u",
  launchCwd: "/home/u",
  launchCwdResolved: true,
  wslDistros: [],
  wslLoading: false,
  wslError: null,
};
const environment = {
  subscribe: () => () => {},
  snapshot: () => environmentSnapshot,
} as unknown as WorkspaceEnvironmentCapability;

function tabs(blocks: boolean): WorkspaceTabsCapability {
  const snapshot = {
    revision: 1,
    initialized: true,
    tabs: [
      {
        id: 1,
        rigId: "rig-a",
        kind: "terminal",
        title: "shell",
        data: {
          blocks,
          activeLeafId: 7,
          cwd: "/repo",
        },
      },
    ],
    activeId: 1,
    splitTabId: 0,
    booted: true,
    activeRigIdForNewTabs: "rig-a",
  } as const;
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
  } as unknown as WorkspaceTabsCapability;
}

function composer(hostedElsewhere = false): UiWorkspaceComposerCapability {
  const focus = vi.fn();
  const snapshot = {
    revision: 1,
    available: true,
    hostedElsewhere,
  };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    focus,
    Region: ({ region, visible }) => (
      <div data-testid={`composer-${region}`} data-visible={visible} />
    ),
  };
}

afterEach(cleanup);

describe("source-owned block terminal footer", () => {
  it("does not add a chat bar beneath ordinary tabs", () => {
    const contribution = createWorkspaceFooterContribution(
      tabs(false),
      theme,
      composer(),
      environment,
    );
    render(<contribution.Component />);
    expect(screen.queryByTestId("shell-input")).toBeNull();
  });

  it("preserves the shell/AI toggle and composes AI-owned regions", () => {
    const ai = composer();
    const contribution = createWorkspaceFooterContribution(
      tabs(true),
      theme,
      ai,
      environment,
    );
    render(<contribution.Component />);

    expect(screen.getByTestId("shell-input")).not.toBeNull();
    expect(screen.getByRole("button", { name: "AI" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(ai.focus).toHaveBeenCalledOnce();
    expect(screen.getByTestId("composer-input").getAttribute("data-visible")).toBe("true");
    expect(screen.getByTestId("composer-actions").getAttribute("data-visible")).toBe("true");
  });

  it("keeps only the shell input while the dock or mini window hosts AI", () => {
    const contribution = createWorkspaceFooterContribution(
      tabs(true),
      theme,
      composer(true),
      environment,
    );
    render(<contribution.Component />);
    expect(screen.getByTestId("shell-input")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
  });
});
