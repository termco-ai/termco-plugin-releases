// @vitest-environment jsdom
import { ContextMenu, ContextMenuTrigger } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplorerContextMenuTarget } from "./ExplorerContextMenu";
import { ExplorerContextMenu } from "./ExplorerContextMenu";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

let runtime: ExplorerRuntimeMocks;

beforeEach(() => {
  runtime = createTestExplorerRuntime();
});

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function setup(options: {
  menuTarget: ExplorerContextMenuTarget | null;
  deleteConfirm?: boolean;
  withTerminal?: boolean;
}) {
  const handlers = {
    setDeleteConfirm: vi.fn<(value: boolean) => void>(),
    onOpenFile: vi.fn<(path: string, pin?: boolean) => void>(),
    onRevealInTerminal: vi.fn<(path: string) => void>(),
    onAttachToAgent: vi.fn<(path: string) => void>(),
    beginCreate: vi.fn<(parentPath: string, kind: "file" | "dir") => void>(),
    deletePath: vi
      .fn<(path: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    refresh: vi.fn<(path: string) => void>(),
  };
  render(
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div data-testid="surface">surface</div>
      </ContextMenuTrigger>
      <ExplorerContextMenu
        menuTarget={options.menuTarget}
        deleteConfirm={options.deleteConfirm ?? false}
        setDeleteConfirm={handlers.setDeleteConfirm}
        rootPath="/ws"
        renameInProgress={false}
        onOpenFile={handlers.onOpenFile}
        onRevealInTerminal={
          options.withTerminal === false
            ? undefined
            : handlers.onRevealInTerminal
        }
        onAttachToAgent={handlers.onAttachToAgent}
        beginCreate={handlers.beginCreate}
        deletePath={handlers.deletePath}
        refresh={handlers.refresh}
      />
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByTestId("surface"));
  return handlers;
}

const fileTarget: ExplorerContextMenuTarget = {
  path: "/ws/src/a.ts",
  name: "a.ts",
  isDir: false,
};

const dirTarget: ExplorerContextMenuTarget = {
  path: "/ws/src",
  name: "src",
  isDir: true,
};

describe("ExplorerContextMenu entry menu", () => {
  it("offers Open for files and opens pinned", () => {
    const handlers = setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Open"));
    expect(handlers.onOpenFile).toHaveBeenCalledWith("/ws/src/a.ts", true);
  });

  it("offers Open in Terminal for directories only", () => {
    const handlers = setup({ menuTarget: dirTarget });
    expect(screen.queryByText("Open")).toBeNull();
    fireEvent.click(screen.getByText("Open in Terminal"));
    expect(handlers.onRevealInTerminal).toHaveBeenCalledWith("/ws/src");
  });

  it("creates new files inside a directory target", () => {
    const handlers = setup({ menuTarget: dirTarget });
    fireEvent.click(screen.getByText("New File"));
    expect(handlers.beginCreate).toHaveBeenCalledWith("/ws/src", "file");
  });

  it("creates new folders next to a file target", () => {
    const handlers = setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("New Folder"));
    expect(handlers.beginCreate).toHaveBeenCalledWith("/ws/src", "dir");
  });

  it("attaches the entry to the agent", () => {
    const handlers = setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Attach to Agent"));
    expect(handlers.onAttachToAgent).toHaveBeenCalledWith("/ws/src/a.ts");
  });

  it("reveals the entry in the file manager", () => {
    setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Reveal in Finder"));
    expect(runtime.desktop.revealItem).toHaveBeenCalledWith("/ws/src/a.ts");
  });

  it("copies the absolute and relative paths", () => {
    setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Copy Path"));
    expect(runtime.desktop.writeClipboardText).toHaveBeenCalledWith("/ws/src/a.ts");

    cleanup();
    setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Copy Relative Path"));
    expect(runtime.desktop.writeClipboardText).toHaveBeenCalledWith("src/a.ts");
  });

  it("arms the delete confirmation on the first click", () => {
    const handlers = setup({ menuTarget: fileTarget });
    fireEvent.click(screen.getByText("Delete"));
    expect(handlers.setDeleteConfirm).toHaveBeenCalledWith(true);
    expect(handlers.deletePath).not.toHaveBeenCalled();
  });

  it("deletes on the confirming click", () => {
    const handlers = setup({ menuTarget: fileTarget, deleteConfirm: true });
    fireEvent.click(screen.getByText("Click again to confirm"));
    expect(handlers.deletePath).toHaveBeenCalledWith("/ws/src/a.ts");
  });
});

describe("ExplorerContextMenu root menu", () => {
  it("targets the workspace root", () => {
    const handlers = setup({ menuTarget: null });
    fireEvent.click(screen.getByText("New File"));
    expect(handlers.beginCreate).toHaveBeenCalledWith("/ws", "file");
  });

  it("refreshes the root", () => {
    const handlers = setup({ menuTarget: null });
    fireEvent.click(screen.getByText("Refresh"));
    expect(handlers.refresh).toHaveBeenCalledWith("/ws");
  });

  it("omits Open in Terminal when no handler is provided", () => {
    setup({ menuTarget: null, withTerminal: false });
    expect(screen.queryByText("Open in Terminal")).toBeNull();
    expect(screen.getByText("Reveal in Finder")).toBeDefined();
  });

  it("offers Open in Terminal on the root when provided", () => {
    const handlers = setup({ menuTarget: null });
    fireEvent.click(screen.getByText("Open in Terminal"));
    expect(handlers.onRevealInTerminal).toHaveBeenCalledWith("/ws");
  });

  it("creates folders and copies the root path", () => {
    const handlers = setup({ menuTarget: null });
    fireEvent.click(screen.getByText("New Folder"));
    expect(handlers.beginCreate).toHaveBeenCalledWith("/ws", "dir");

    cleanup();
    setup({ menuTarget: null });
    fireEvent.click(screen.getByText("Copy Path"));
    expect(runtime.desktop.writeClipboardText).toHaveBeenCalledWith("/ws");
  });

  it("reveals the root in the file manager", () => {
    setup({ menuTarget: null });
    fireEvent.click(screen.getByText("Reveal in Finder"));
    expect(runtime.desktop.revealItem).toHaveBeenCalledWith("/ws");
  });
});
