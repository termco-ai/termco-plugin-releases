// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExplorerDnd } from "./useExplorerDnd";

const DIRS = new Set(["/ws/dir"]);

function makeRow(path: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-fs-path", path);
  document.body.appendChild(el);
  return el;
}

function pointerDownOn(el: HTMLElement, x = 0, y = 0): ReactPointerEvent {
  return {
    button: 0,
    target: el,
    clientX: x,
    clientY: y,
  } as unknown as ReactPointerEvent;
}

function firePointer(type: string, x: number, y: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  });
}

let hovered: HTMLElement | null = null;

beforeEach(() => {
  hovered = null;
  document.elementFromPoint = vi.fn(() => hovered);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function setup() {
  const onMove = vi.fn();
  const hook = renderHook(() =>
    useExplorerDnd({
      rootPath: "/ws",
      isDir: (p) => DIRS.has(p),
      onMove,
    }),
  );
  return { hook, onMove };
}

describe("useExplorerDnd", () => {
  it("ignores non-primary buttons and non-row targets", () => {
    const { hook } = setup();
    const row = makeRow("/ws/file.txt");
    act(() => {
      hook.result.current.onPointerDown({
        ...pointerDownOn(row),
        button: 2,
      } as ReactPointerEvent);
    });
    firePointer("pointermove", 50, 50);
    expect(hook.result.current.dragLabel).toBeNull();

    const plain = document.createElement("div");
    document.body.appendChild(plain);
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(plain));
    });
    firePointer("pointermove", 50, 50);
    expect(hook.result.current.dragLabel).toBeNull();
  });

  it("does not start dragging below the movement threshold", () => {
    const { hook } = setup();
    const row = makeRow("/ws/file.txt");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(row));
    });
    firePointer("pointermove", 2, 2);
    expect(hook.result.current.dragLabel).toBeNull();
  });

  it("starts dragging past the threshold and moves onto a directory", () => {
    const { hook, onMove } = setup();
    const row = makeRow("/ws/file.txt");
    const dirRow = makeRow("/ws/dir");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(row));
    });
    hovered = dirRow;
    firePointer("pointermove", 40, 40);
    expect(hook.result.current.dragLabel).toBe("file.txt");
    expect(hook.result.current.dropTargetDir).toBe("/ws/dir");

    firePointer("pointerup", 40, 40);
    expect(onMove).toHaveBeenCalledWith("/ws/file.txt", "/ws/dir");
    expect(hook.result.current.dragLabel).toBeNull();
    expect(hook.result.current.dropTargetDir).toBeNull();
  });

  it("targets the parent directory when hovering a file row", () => {
    const { hook, onMove } = setup();
    const source = makeRow("/ws/dir/inner.txt");
    const fileRow = makeRow("/ws/other.txt");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(source));
    });
    hovered = fileRow;
    firePointer("pointermove", 40, 40);
    // Parent of /ws/other.txt is the root.
    expect(hook.result.current.dropTargetDir).toBe("/ws");
    firePointer("pointerup", 40, 40);
    expect(onMove).toHaveBeenCalledWith("/ws/dir/inner.txt", "/ws");
  });

  it("rejects dropping onto itself, its parent, or its own subtree", () => {
    const { hook, onMove } = setup();
    const dirRow = makeRow("/ws/dir");
    const childRow = makeRow("/ws/dir/nested.txt");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(dirRow));
    });
    hovered = dirRow;
    firePointer("pointermove", 40, 40);
    expect(hook.result.current.dropTargetDir).toBeNull();

    hovered = childRow;
    firePointer("pointermove", 45, 45);
    expect(hook.result.current.dropTargetDir).toBeNull();

    // No row under the cursor falls back to the root, which is the parent.
    hovered = null;
    firePointer("pointermove", 50, 50);
    expect(hook.result.current.dropTargetDir).toBeNull();

    firePointer("pointerup", 50, 50);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("cancels without moving on pointercancel", () => {
    const { hook, onMove } = setup();
    const row = makeRow("/ws/file.txt");
    const dirRow = makeRow("/ws/dir");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(row));
    });
    hovered = dirRow;
    firePointer("pointermove", 40, 40);
    expect(hook.result.current.dropTargetDir).toBe("/ws/dir");
    firePointer("pointercancel", 40, 40);
    expect(onMove).not.toHaveBeenCalled();
    expect(hook.result.current.dragLabel).toBeNull();
  });

  it("suppresses the click right after a drag ends", () => {
    const { hook } = setup();
    const row = makeRow("/ws/file.txt");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(row));
    });
    hovered = makeRow("/ws/dir");
    firePointer("pointermove", 40, 40);
    firePointer("pointerup", 40, 40);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    act(() => {
      hook.result.current.onClickCapture({
        preventDefault,
        stopPropagation,
      } as unknown as React.MouseEvent);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();

    // The suppression is consumed by the first click.
    const preventDefault2 = vi.fn();
    act(() => {
      hook.result.current.onClickCapture({
        preventDefault: preventDefault2,
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent);
    });
    expect(preventDefault2).not.toHaveBeenCalled();
  });

  it("positions the ghost element at the last pointer position", () => {
    const { hook } = setup();
    const row = makeRow("/ws/file.txt");
    act(() => {
      hook.result.current.onPointerDown(pointerDownOn(row));
    });
    firePointer("pointermove", 100, 60);
    const ghost = document.createElement("div");
    act(() => {
      hook.result.current.ghostRef(ghost);
    });
    expect(ghost.style.left).toBe("112px");
    expect(ghost.style.top).toBe("68px");
    firePointer("pointerup", 100, 60);
  });
});
