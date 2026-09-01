// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FileExplorer, type FileExplorerHandle } from "./FileExplorer";
import type { DirEntry } from "./lib/useFileTree";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../testRuntime";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getTotalSize: () => opts.count * 24,
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        key: index,
        size: 24,
        start: index * 24,
      })),
    scrollToIndex: vi.fn(),
  }),
}));

function entry(name: string, kind: DirEntry["kind"] = "file"): DirEntry {
  return { name, kind, size: 0, mtime: 0, gitignored: false };
}

const LISTING: Record<string, DirEntry[]> = {
  "/ws": [entry("src", "dir"), entry("readme.md")],
  "/ws/src": [entry("main.ts")],
};
let runtime: ExplorerRuntimeMocks;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  runtime.files.readDir.mockImplementation((path) => {
    const entries = LISTING[path];
    if (!entries) return Promise.reject(new Error("not found"));
    return Promise.resolve(entries);
  });
  runtime.shortcuts.snapshot = () => ({
    revision: 0,
    groups: ["Search"],
    shortcuts: [{
      id: "explorer.search",
      label: "Search files",
      group: "Search",
      defaultBindings: [{ key: "f", meta: true, shift: true }],
    }],
    overrides: {},
  });
  runtime.shortcuts.bindings = () => [{ key: "f", meta: true, shift: true }];
  runtime.shortcuts.match = (event) =>
    event.key.toLowerCase() === "f" && event.metaKey && event.shiftKey;
});

afterEach(cleanup);

function setup(rootPath: string | null = "/ws") {
  const onOpenFile = vi.fn();
  const ref = createRef<FileExplorerHandle>();
  render(
    <FileExplorer
      ref={ref}
      rootPath={rootPath}
      env={{ kind: "local" }}
      onOpenFile={onOpenFile}
    />,
  );
  return { onOpenFile, ref };
}

describe("FileExplorer", () => {
  it("renders the empty state without a root", () => {
    setup(null);
    expect(screen.getByText("No workspace open")).toBeDefined();
  });

  it("lists the root directory under the header", async () => {
    setup();
    expect(screen.getByText("ws")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeDefined();
      expect(screen.getByText("readme.md")).toBeDefined();
    });
  });

  it("opens a file on click", async () => {
    const { onOpenFile } = setup();
    await screen.findByText("readme.md");
    fireEvent.click(screen.getByText("readme.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/ws/readme.md");
  });

  it("expands a directory on click and lists its children", async () => {
    setup();
    await screen.findByText("src");
    fireEvent.click(screen.getByText("src"));
    await waitFor(() => {
      expect(screen.getByText("main.ts")).toBeDefined();
    });
  });

  it("shows an inline create input from the header new-file action", async () => {
    setup();
    await screen.findByText("src");
    fireEvent.click(screen.getByTitle("New file"));
    const input = await screen.findByPlaceholderText("New file");
    fireEvent.change(input, { target: { value: "fresh.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(runtime.files.createFile).toHaveBeenCalledWith(
        "/ws/fresh.ts",
        { kind: "local" },
      );
    });
  });

  it("navigates entries with the keyboard and opens with Enter", async () => {
    const { onOpenFile } = setup();
    await screen.findByText("readme.md");
    const container = screen
      .getByText("ws")
      .closest("[tabindex]") as HTMLElement;
    // ArrowUp with no selection lands on the last entry (readme.md),
    // regardless of any expansion remembered from earlier mounts.
    fireEvent.keyDown(container, { key: "ArrowUp" });
    fireEvent.keyDown(container, { key: "Enter" });
    expect(onOpenFile).toHaveBeenCalledWith("/ws/readme.md");
  });

  it("focuses and selects the first entry through the handle", async () => {
    const { ref } = setup();
    await screen.findByText("src");
    expect(ref.current?.isFocused()).toBe(false);
    ref.current?.focus();
    expect(ref.current?.isFocused()).toBe(true);
  });

  it("opens the context menu for an entry", async () => {
    const { onOpenFile } = setup();
    await screen.findByText("readme.md");
    fireEvent.contextMenu(screen.getByText("readme.md"));
    fireEvent.click(await screen.findByText("Open"));
    expect(onOpenFile).toHaveBeenCalledWith("/ws/readme.md", true);
  });

  it("opens the root context menu on empty rig", async () => {
    setup();
    await screen.findByText("readme.md");
    const readsBefore = runtime.files.readDir.mock.calls.length;
    const surface = document.querySelector(
      "[data-explorer-drop]",
    ) as HTMLElement;
    fireEvent.contextMenu(surface);
    fireEvent.click(await screen.findByText("Refresh"));
    await waitFor(() => {
      const readsAfter = runtime.files.readDir.mock.calls.length;
      expect(readsAfter).toBe(readsBefore + 1);
    });
  });

  it("toggles the search input from the header", async () => {
    setup();
    await screen.findByText("src");
    fireEvent.click(screen.getByLabelText("Search files"));
    expect(screen.getByPlaceholderText("Search files…")).toBeDefined();
    fireEvent.click(screen.getByLabelText("Search files"));
    expect(screen.queryByPlaceholderText("Search files…")).toBeNull();
  });

  it("opens search via the imperative handle and the global shortcut", async () => {
    const { ref } = setup();
    await screen.findByText("src");
    act(() => ref.current?.focusSearch());
    expect(screen.getByPlaceholderText("Search files…")).toBeDefined();

    // The shortcut closes the search when its input is already focused.
    const input = screen.getByPlaceholderText("Search files…");
    act(() => input.focus());
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", metaKey: true, shiftKey: true }),
      ),
    );
    expect(screen.queryByPlaceholderText("Search files…")).toBeNull();
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", metaKey: true, shiftKey: true }),
      ),
    );
    expect(screen.getByPlaceholderText("Search files…")).toBeDefined();
  });

  it("selects and highlights the active file", async () => {
    const onOpenFile = vi.fn();
    render(
      <FileExplorer
        rootPath="/ws"
        env={{ kind: "local" }}
        activeFilePath="/ws/readme.md"
        onOpenFile={onOpenFile}
      />,
    );
    await screen.findByText("readme.md");
    await waitFor(() => {
      const row = screen
        .getByText("readme.md")
        .closest("button") as HTMLElement;
      expect(row.className).toContain("bg-accent");
    });
  });

  it("creates folders and refreshes from the header", async () => {
    setup();
    await screen.findByText("src");
    fireEvent.click(screen.getByTitle("New folder"));
    expect(await screen.findByPlaceholderText("New folder")).toBeDefined();
    fireEvent.keyDown(screen.getByPlaceholderText("New folder"), {
      key: "Escape",
    });

    const readsBefore = runtime.files.readDir.mock.calls.length;
    fireEvent.click(screen.getByTitle("Refresh"));
    await waitFor(() => {
      const readsAfter = runtime.files.readDir.mock.calls.length;
      expect(readsAfter).toBe(readsBefore + 1);
    });
  });

  it("auto-expands a collapsed directory hovered during a drag", async () => {
    setup();
    await screen.findByText("readme.md");
    // Ensure src is collapsed even if a previous mount remembered it open.
    if (screen.queryByText("main.ts")) {
      fireEvent.click(screen.getByText("src"));
      await waitFor(() => {
        expect(screen.queryByText("main.ts")).toBeNull();
      });
    }
    const source = screen.getByText("readme.md").closest("button") as Element;
    const target = screen.getByText("src").closest("button") as HTMLElement;
    document.elementFromPoint = vi.fn(() => target);

    fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0 });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 40, clientY: 40 }),
      );
    });
    await screen.findByText("main.ts", undefined, { timeout: 2000 });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointercancel", { clientX: 40, clientY: 40 }),
      );
    });
  });

  it("moves an entry into a directory via pointer drag", async () => {
    setup();
    await screen.findByText("readme.md");
    const source = screen.getByText("readme.md").closest("button") as Element;
    const target = screen.getByText("src").closest("button") as HTMLElement;
    document.elementFromPoint = vi.fn(() => target);

    fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0 });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 40, clientY: 40 }),
      );
    });
    expect(screen.getAllByText("readme.md").length).toBeGreaterThan(1);
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 40, clientY: 40 }),
      );
    });
    await waitFor(() => {
      expect(runtime.files.rename).toHaveBeenCalledWith(
        "/ws/readme.md",
        "/ws/src/readme.md",
        { kind: "local" },
      );
    });
  });
});
