// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RowActions } from "./EntryRow";
import { EntryRow, type EntryRowProps } from "./EntryRow";

afterEach(cleanup);

function makeActions(): RowActions {
  return {
    toggle: vi.fn(),
    beginRename: vi.fn(),
    commitRename: vi.fn(),
    cancelRename: vi.fn(),
  };
}

function setup(overrides: Partial<EntryRowProps> = {}) {
  const actions = (overrides.actions as RowActions) ?? makeActions();
  const props: EntryRowProps = {
    path: "/ws/a.ts",
    name: "a.ts",
    isDir: false,
    isExpanded: false,
    depth: 0,
    actions,
    renameInProgress: false,
    isSelected: false,
    isRenaming: false,
    onOpenFile: vi.fn(),
    onSelectPath: vi.fn(),
    ...overrides,
  };
  const view = render(<EntryRow {...props} />);
  return { view, props, actions };
}

describe("EntryRow", () => {
  it("renders the name and exposes the fs path", () => {
    setup();
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-fs-path")).toBe("/ws/a.ts");
    expect(screen.getByText("a.ts")).toBeDefined();
  });

  it("selects and opens a file on click", () => {
    const { props, actions } = setup();
    fireEvent.click(screen.getByRole("button"));
    expect(props.onSelectPath).toHaveBeenCalledWith("/ws/a.ts");
    expect(props.onOpenFile).toHaveBeenCalledWith("/ws/a.ts");
    expect(actions.toggle).not.toHaveBeenCalled();
  });

  it("selects and toggles a directory on click", () => {
    const { props, actions } = setup({
      path: "/ws/src",
      name: "src",
      isDir: true,
    });
    fireEvent.click(screen.getByRole("button"));
    expect(props.onSelectPath).toHaveBeenCalledWith("/ws/src");
    expect(actions.toggle).toHaveBeenCalledWith("/ws/src");
    expect(props.onOpenFile).not.toHaveBeenCalled();
  });

  it("ignores clicks while a rename is in progress elsewhere", () => {
    const { props } = setup({ renameInProgress: true });
    fireEvent.click(screen.getByRole("button"));
    expect(props.onSelectPath).not.toHaveBeenCalled();
    expect(props.onOpenFile).not.toHaveBeenCalled();
  });

  it("begins a rename on double click for files only", () => {
    const { actions } = setup();
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(actions.beginRename).toHaveBeenCalledWith("/ws/a.ts");

    cleanup();
    const dir = setup({ path: "/ws/src", name: "src", isDir: true });
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(dir.actions.beginRename).not.toHaveBeenCalled();
  });

  it("swaps to an inline input while renaming", () => {
    const { actions } = setup({ isRenaming: true });
    const input = screen.getByRole<HTMLInputElement>("textbox");
    expect(input.value).toBe("a.ts");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(actions.cancelRename).toHaveBeenCalled();
  });

  it("indents by depth", () => {
    setup({ depth: 2 });
    expect(screen.getByRole("button").style.paddingLeft).toBe("30px");
  });

  it("applies selection styling over git status tinting", () => {
    setup({ isSelected: true, gitStatusCode: "M" });
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-[var(--signal-soft)]");
    const name = screen.getByText("a.ts");
    expect(name.className).not.toContain("text-amber-200/85");
  });

  it("tints the name for git-changed entries", () => {
    setup({ gitStatusCode: "M" });
    expect(screen.getByText("a.ts").className).toContain("text-amber-200/85");
  });

  it("mutes gitignored entries and suppresses their tint", () => {
    setup({ gitignored: true, gitStatusCode: "M" });
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-muted-foreground/70");
    expect(screen.getByText("a.ts").className).not.toContain(
      "text-amber-200/85",
    );
  });

  it("marks the active drop target", () => {
    setup({ isDropTarget: true });
    expect(screen.getByRole("button").className).toContain("ring-primary/60");
  });

  it("rotates the chevron for expanded directories", () => {
    const { view } = setup({
      path: "/ws/src",
      name: "src",
      isDir: true,
      isExpanded: true,
    });
    expect(view.container.querySelector(".rotate-90")).not.toBeNull();
  });

  it("renders no chevron for files", () => {
    const { view } = setup();
    expect(view.container.querySelector("svg")).toBeNull();
  });
});
