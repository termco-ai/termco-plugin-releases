// @vitest-environment jsdom
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { UiSidebarViewProps } from "@termco/ui-sidebar-base";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchPanel } from "./renderer";

const hits = [
  {
    path: "/repo/src/a.ts",
    rel: "src/a.ts",
    line: 3,
    text: "  const foo = 1;",
  },
  { path: "/repo/src/b.ts", rel: "src/b.ts", line: 12, text: "foo()" },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

function setup(
  grepInteractive = vi.fn().mockResolvedValue({ hits: [], truncated: false }),
  rootPath: string | null = "/repo",
) {
  const files = { grepInteractive } as unknown as WorkspaceFilesCapability;
  const Panel = createSearchPanel(files);
  const openFileAt = vi.fn();
  const props = {
    rootPath,
    workspace: { kind: "local" },
    activeFilePath: null,
    openFileAt,
    openFile: vi.fn(),
    navigateToPath: vi.fn(),
    pathRenamed: vi.fn(),
    pathDeleted: vi.fn(),
    attachFileToAgent: vi.fn(),
    runInNewTerminal: vi.fn().mockResolvedValue(undefined),
  } as UiSidebarViewProps;
  render(<Panel {...props} />);
  return { grepInteractive, openFileAt };
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search file contents"), {
    target: { value },
  });
}

describe("WorkspaceSearch", () => {
  it("restores the exact header, input chrome, and initial focus", () => {
    const { container } = renderSearch();
    expect(screen.getByText("SEARCH IN FILES")).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Search file contents"),
    );
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("keeps workspace and minimum-query hints", async () => {
    setup(undefined, null);
    expect(screen.getByText("No workspace root.")).toBeDefined();
    cleanup();
    const { grepInteractive } = setup();
    type("f");
    await flush();
    expect(grepInteractive).not.toHaveBeenCalled();
    expect(screen.getByText(/Type at least 2 characters/)).toBeDefined();
  });

  it("greps the active workspace and opens the exact hit line", async () => {
    const grepInteractive = vi.fn().mockResolvedValue({ hits, truncated: false });
    const { openFileAt } = setup(grepInteractive);
    type("foo");
    await flush();
    expect(grepInteractive).toHaveBeenCalledWith(
      { pattern: "foo", root: "/repo", maxResults: 80 },
      { kind: "local" },
    );
    expect(screen.getByText("a.ts")).toBeDefined();
    expect(screen.getByText(":3")).toBeDefined();
    expect(screen.getByText("const foo = 1;")).toBeDefined();
    fireEvent.click(screen.getByText("b.ts"));
    expect(openFileAt).toHaveBeenCalledWith("/repo/src/b.ts", 12);
  });

  it("restores empty, error, and retry behavior", async () => {
    const grepInteractive = vi
      .fn()
      .mockRejectedValueOnce("ripgrep exploded")
      .mockResolvedValueOnce({ hits, truncated: false });
    setup(grepInteractive);
    type("foo");
    await flush();
    expect(screen.getByText(/Search failed:.*ripgrep exploded/)).toBeDefined();
    fireEvent.click(screen.getByText("Retry"));
    await flush();
    expect(screen.getByText("a.ts")).toBeDefined();
  });
});

function renderSearch() {
  setup();
  return { container: screen.getByTestId("workspace-search-sidebar") };
}
