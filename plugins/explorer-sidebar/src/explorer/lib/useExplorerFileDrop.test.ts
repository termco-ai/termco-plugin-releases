// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExplorerFileDrop } from "./useExplorerFileDrop";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

type DragDropEvent = {
  type: "enter" | "over" | "leave" | "drop";
  position?: { x: number; y: number };
  paths?: string[];
};

let dragHandler: ((e: DragDropEvent) => void) | undefined;
const unlisten = vi.fn();
let hovered: HTMLElement | null = null;
let runtime: ExplorerRuntimeMocks;

function makeRow(path: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-fs-path", path);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  dragHandler = undefined;
  hovered = null;
  document.elementFromPoint = vi.fn(() => hovered);
  runtime = createTestExplorerRuntime();
  runtime.desktop.subscribeDragDrop.mockImplementation((cb) => {
    dragHandler = cb as (event: DragDropEvent) => void;
    return unlisten;
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

function setup(rootPath: string | null = "/ws") {
  const onCopied = vi.fn();
  const hook = renderHook(() =>
    useExplorerFileDrop({
      rootPath,
      env: { kind: "local" },
      isDir: (p) => p === "/ws/dir",
      onCopied,
    }),
  );
  return { hook, onCopied };
}

async function ready() {
  await waitFor(() => {
    expect(dragHandler).toBeDefined();
  });
}

describe("useExplorerFileDrop", () => {
  it("tracks the hovered directory on enter and over", async () => {
    const { hook } = setup();
    await ready();
    hovered = makeRow("/ws/dir");
    act(() =>
      dragHandler?.({ type: "enter", position: { x: 5, y: 5 } }),
    );
    expect(hook.result.current.externalTargetDir).toBe("/ws/dir");

    act(() => dragHandler?.({ type: "leave" }));
    expect(hook.result.current.externalTargetDir).toBeNull();
  });

  it("resolves a file row to its parent directory", async () => {
    const { hook } = setup();
    await ready();
    hovered = makeRow("/ws/dir/file.txt");
    act(() =>
      dragHandler?.({ type: "over", position: { x: 5, y: 5 } }),
    );
    expect(hook.result.current.externalTargetDir).toBe("/ws/dir");
  });

  it("falls back to the root inside the explorer container", async () => {
    const { hook } = setup();
    await ready();
    const container = document.createElement("div");
    container.setAttribute("data-explorer-drop", "");
    const inner = document.createElement("div");
    container.appendChild(inner);
    document.body.appendChild(container);
    hovered = inner;
    act(() =>
      dragHandler?.({ type: "over", position: { x: 5, y: 5 } }),
    );
    expect(hook.result.current.externalTargetDir).toBe("/ws");
  });

  it("ignores hovers outside the explorer", async () => {
    const { hook } = setup();
    await ready();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    hovered = outside;
    act(() =>
      dragHandler?.({ type: "over", position: { x: 5, y: 5 } }),
    );
    expect(hook.result.current.externalTargetDir).toBeNull();
  });

  it("copies dropped files into the target directory", async () => {
    const { hook, onCopied } = setup();
    await ready();
    hovered = makeRow("/ws/dir");
    await act(async () => {
      dragHandler?.({
        type: "drop",
        position: { x: 5, y: 5 },
        paths: ["/tmp/x.txt"],
      });
    });
    expect(runtime.files.copy).toHaveBeenCalledWith(
      ["/tmp/x.txt"],
      "/ws/dir",
      { kind: "local" },
    );
    expect(onCopied).toHaveBeenCalledWith("/ws/dir");
    expect(hook.result.current.externalTargetDir).toBeNull();
  });

  it("ignores drops that land nowhere or carry no paths", async () => {
    setup();
    await ready();
    hovered = null;
    act(() =>
      dragHandler?.({ type: "drop", position: { x: 5, y: 5 }, paths: ["/tmp/x"] }),
    );
    hovered = makeRow("/ws/dir");
    act(() =>
      dragHandler?.({ type: "drop", position: { x: 5, y: 5 }, paths: [] }),
    );
    expect(runtime.files.copy).not.toHaveBeenCalled();
  });

  it("surfaces copy failures as a toast", async () => {
    runtime.files.copy.mockRejectedValue(new Error("disk full"));
    const { onCopied } = setup();
    await ready();
    hovered = makeRow("/ws/dir");
    await act(async () => {
      dragHandler?.({
        type: "drop",
        position: { x: 5, y: 5 },
        paths: ["/tmp/x.txt"],
      });
    });
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("disk full"),
    );
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("scales physical-pixel positions down by the device pixel ratio", async () => {
    setup();
    await ready();
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    });
    hovered = makeRow("/ws/dir");
    act(() =>
      dragHandler?.({ type: "over", position: { x: 3000, y: 400 } }),
    );
    expect(document.elementFromPoint).toHaveBeenCalledWith(1500, 200);
  });

  it("logs when the drag-drop subscription fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.desktop.subscribeDragDrop.mockImplementation(() => {
      throw new Error("no webview");
    });
    setup();
    await waitFor(() => {
      expect(error).toHaveBeenCalled();
    });
    error.mockRestore();
  });

  it("unsubscribes on unmount", async () => {
    const { hook } = setup();
    await ready();
    hook.unmount();
    expect(unlisten).toHaveBeenCalled();
  });
});
