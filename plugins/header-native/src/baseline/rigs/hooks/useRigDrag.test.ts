// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RigMeta } from "../../types";
import { useRigDrag } from "./useRigDrag";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function meta(id: string): RigMeta {
  return {
    id,
    name: id,
    root: null,
    workspaceKind: "local",
  };
}

const onMoveTabToRig = vi.fn();
const onReorderTab = vi.fn();
const onReorderRigs = vi.fn();

function mount(rigs = [meta("a"), meta("b"), meta("c")]) {
  return renderHook(() =>
    useRigDrag({ rigs, onMoveTabToRig, onReorderTab, onReorderRigs }),
  );
}

function dragEl(): HTMLElement {
  const el = document.createElement("div");
  (el as unknown as { setPointerCapture: () => void }).setPointerCapture =
    () => {};
  (
    el as unknown as { releasePointerCapture: () => void }
  ).releasePointerCapture = () => {};
  document.body.appendChild(el);
  return el;
}

function pev(
  over: Partial<{
    button: number;
    pointerId: number;
    clientX: number;
    clientY: number;
    target: Element;
    currentTarget: Element;
  }> = {},
): React.PointerEvent {
  const el = over.currentTarget ?? dragEl();
  return {
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    target: over.target ?? el,
    currentTarget: el,
    preventDefault: () => {},
    ...over,
  } as unknown as React.PointerEvent;
}

/** Install a drop target under the pointer with the given data attributes. */
function installHit(
  attrs: Record<string, string>,
  rect: Partial<DOMRect> = {},
): HTMLElement {
  const hit = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) hit.setAttribute(k, v);
  hit.getBoundingClientRect = () =>
    ({ top: 0, height: 20, left: 0, width: 100, ...rect }) as DOMRect;
  document.body.appendChild(hit);
  document.elementFromPoint = () => hit;
  return hit;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.elementFromPoint = () => null;
});

describe("activation threshold", () => {
  it("treats a press-and-release without movement as a click", () => {
    const { result } = mount();
    const onActivate = vi.fn();
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerUp(pev(), onActivate));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onReorderRigs).not.toHaveBeenCalled();
  });

  it("stays inactive under the movement threshold", () => {
    const { result } = mount();
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 3, clientY: 0 })));
    expect(result.current.dragging).toBeNull();
    const onActivate = vi.fn();
    act(() => result.current.onPointerUp(pev(), onActivate));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("activates past the threshold and tracks the overlay", () => {
    const { result } = mount();
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 30, clientY: 8 })));
    expect(result.current.dragging).toEqual({ kind: "rig", id: "a" });
    expect(result.current.overlay).toEqual({ x: 30, y: 8 });
    expect(document.body.style.userSelect).toBe("none");
    act(() => result.current.onPointerUp(pev()));
    expect(result.current.dragging).toBeNull();
    expect(result.current.overlay).toBeNull();
    expect(document.body.style.userSelect).toBe("");
  });

  it("ignores non-left buttons and data-no-drag targets", () => {
    const { result } = mount();
    act(() => result.current.onPointerDown(pev({ button: 2 }), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 40 })));
    expect(result.current.dragging).toBeNull();

    const el = dragEl();
    el.setAttribute("data-no-drag", "");
    act(() =>
      result.current.onPointerDown(
        pev({ target: el, currentTarget: el }),
        "rig",
        "a",
      ),
    );
    act(() => result.current.onPointerMove(pev({ clientX: 40 })));
    expect(result.current.dragging).toBeNull();
  });

  it("ignores moves from a different pointer id", () => {
    const { result } = mount();
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ pointerId: 9, clientX: 40 })));
    expect(result.current.dragging).toBeNull();
  });
});

describe("rig reordering", () => {
  it("reorders below the target on the bottom edge", () => {
    const { result } = mount();
    installHit({ "data-drop": "rig", "data-rig-id": "b" });
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 30, clientY: 15 })));
    expect(result.current.drop).toEqual({
      kind: "rig",
      rigId: "b",
      edge: "bottom",
    });
    act(() => result.current.onPointerUp(pev()));
    expect(onReorderRigs).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("reorders above the target on the top edge", () => {
    const { result } = mount();
    installHit({ "data-drop": "rig", "data-rig-id": "c" });
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 30, clientY: 4 })));
    act(() => result.current.onPointerUp(pev()));
    expect(onReorderRigs).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("never targets the dragged rig itself", () => {
    const { result } = mount();
    installHit({ "data-drop": "rig", "data-rig-id": "a" });
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 30, clientY: 4 })));
    expect(result.current.drop).toBeNull();
    act(() => result.current.onPointerUp(pev()));
    expect(onReorderRigs).not.toHaveBeenCalled();
  });

  it("ignores tab rows while dragging a rig", () => {
    const { result } = mount();
    installHit({ "data-drop": "tab", "data-tab-id": "7" });
    act(() => result.current.onPointerDown(pev(), "rig", "a"));
    act(() => result.current.onPointerMove(pev({ clientX: 30 })));
    expect(result.current.drop).toBeNull();
  });
});

describe("tab dragging", () => {
  it("reorders a tab relative to another tab", () => {
    const { result } = mount();
    installHit({ "data-drop": "tab", "data-tab-id": "20" });
    act(() => result.current.onPointerDown(pev(), "tab", 10));
    act(() => result.current.onPointerMove(pev({ clientX: 30, clientY: 3 })));
    expect(result.current.drop).toEqual({
      kind: "tab",
      tabId: 20,
      edge: "top",
    });
    act(() => result.current.onPointerUp(pev()));
    expect(onReorderTab).toHaveBeenCalledWith(10, 20, "top");
  });

  it("never targets the dragged tab itself", () => {
    const { result } = mount();
    installHit({ "data-drop": "tab", "data-tab-id": "10" });
    act(() => result.current.onPointerDown(pev(), "tab", 10));
    act(() => result.current.onPointerMove(pev({ clientX: 30 })));
    expect(result.current.drop).toBeNull();
  });

  it("moves a tab into a rig when dropped on its header", () => {
    const { result } = mount();
    installHit({ "data-drop": "rig", "data-rig-id": "b" });
    act(() => result.current.onPointerDown(pev(), "tab", 10));
    act(() => result.current.onPointerMove(pev({ clientX: 30 })));
    expect(result.current.drop).toEqual({ kind: "into-rig", rigId: "b" });
    act(() => result.current.onPointerUp(pev()));
    expect(onMoveTabToRig).toHaveBeenCalledWith(10, "b");
  });

  it("clears the drop target when the pointer leaves all rows", () => {
    const { result } = mount();
    installHit({ "data-drop": "rig", "data-rig-id": "b" });
    act(() => result.current.onPointerDown(pev(), "tab", 10));
    act(() => result.current.onPointerMove(pev({ clientX: 30 })));
    expect(result.current.drop).not.toBeNull();
    document.elementFromPoint = () => null;
    act(() => result.current.onPointerMove(pev({ clientX: 60 })));
    expect(result.current.drop).toBeNull();
    act(() => result.current.onPointerUp(pev()));
    expect(onMoveTabToRig).not.toHaveBeenCalled();
    expect(onReorderTab).not.toHaveBeenCalled();
  });
});
