// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalDropStore } from "../lib/dropStore";
import { pasteIntoLeaf } from "../lib/rendererPool";
import { useTerminalFileDrop } from "./useTerminalFileDrop";

type DragPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "leave" }
  | { type: "drop"; position: { x: number; y: number }; paths: string[] };

const hoisted = vi.hoisted(() => ({
  handler: null as ((e: { payload: DragPayload }) => void) | null,
  unlisten: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("../../runtime", () => ({
  terminalRuntime: () => ({
    desktop: {
      subscribeDragDrop: hoisted.subscribe.mockImplementation(
        (cb: (event: DragPayload) => void) => {
          hoisted.handler = ({ payload }) => cb(payload);
          return hoisted.unlisten;
        },
      ),
    },
  }),
}));

vi.mock("../lib/rendererPool", () => ({ pasteIntoLeaf: vi.fn(() => true) }));
vi.mock("../../platform", () => ({ IS_WINDOWS: false }));

function emit(payload: DragPayload) {
  hoisted.handler?.({ payload });
}

// jsdom does not implement elementFromPoint; install a controllable stub.
const elementFromPoint = vi.fn<(x: number, y: number) => Element | null>(
  () => null,
);
Object.defineProperty(document, "elementFromPoint", {
  value: elementFromPoint,
  configurable: true,
  writable: true,
});

function leafElementAt(leafId: number): HTMLElement {
  const el = document.createElement("div");
  el.dataset.paneLeaf = String(leafId);
  document.body.appendChild(el);
  return el;
}

async function mount() {
  const utils = renderHook(() => useTerminalFileDrop());
  await Promise.resolve();
  await Promise.resolve();
  return utils;
}

beforeEach(() => {
  hoisted.handler = null;
  hoisted.unlisten.mockClear();
  hoisted.subscribe.mockClear();
  vi.mocked(pasteIntoLeaf).mockClear();
  elementFromPoint.mockReset();
  elementFromPoint.mockReturnValue(null);
  useTerminalDropStore.getState().setTarget(null);
  document.body.innerHTML = "";
});

describe("useTerminalFileDrop", () => {
  it("targets the pane under the cursor while dragging", async () => {
    const el = leafElementAt(8);
    elementFromPoint.mockReturnValue(el);
    const utils = await mount();
    emit({ type: "enter", paths: [], position: { x: 10, y: 10 } });
    expect(useTerminalDropStore.getState().targetLeafId).toBe(8);
    utils.unmount();
  });

  it("clears the target when the drag leaves the window", async () => {
    const el = leafElementAt(8);
    elementFromPoint.mockReturnValue(el);
    const utils = await mount();
    emit({ type: "over", position: { x: 10, y: 10 } });
    emit({ type: "leave" });
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
    utils.unmount();
  });

  it("clears the target when hovering outside any terminal leaf", async () => {
    elementFromPoint.mockReturnValue(document.createElement("div"));
    const utils = await mount();
    emit({ type: "over", position: { x: 10, y: 10 } });
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
    utils.unmount();
  });

  it("pastes shell-quoted paths into the pane on drop", async () => {
    const el = leafElementAt(4);
    elementFromPoint.mockReturnValue(el);
    const utils = await mount();
    emit({
      type: "drop",
      position: { x: 10, y: 10 },
      paths: ["/plain/path.txt", "/with space/file.txt"],
    });
    expect(pasteIntoLeaf).toHaveBeenCalledWith(
      4,
      "/plain/path.txt '/with space/file.txt' ",
    );
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
    utils.unmount();
  });

  it("ignores drops outside any pane and drops with no paths", async () => {
    elementFromPoint.mockReturnValue(null);
    const utils = await mount();
    emit({ type: "drop", position: { x: 10, y: 10 }, paths: ["/x"] });
    emit({ type: "drop", position: { x: 10, y: 10 }, paths: [] });
    expect(pasteIntoLeaf).not.toHaveBeenCalled();
    utils.unmount();
  });

  it("scales physical-pixel coordinates down when they overflow the viewport", async () => {
    const el = leafElementAt(2);
    elementFromPoint.mockReturnValue(el);
    vi.stubGlobal("devicePixelRatio", 2);
    const utils = await mount();
    const x = window.innerWidth * 2 - 2;
    emit({ type: "over", position: { x, y: 20 } });
    expect(elementFromPoint).toHaveBeenCalledWith(x / 2, 10);
    expect(useTerminalDropStore.getState().targetLeafId).toBe(2);
    vi.unstubAllGlobals();
    utils.unmount();
  });

  it("ignores panes with a malformed leaf id", async () => {
    const el = document.createElement("div");
    el.setAttribute("data-pane-leaf", "not-a-number");
    document.body.appendChild(el);
    elementFromPoint.mockReturnValue(el);
    const utils = await mount();
    emit({ type: "over", position: { x: 5, y: 5 } });
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
    utils.unmount();
  });

  it("unlistens and clears the target on unmount", async () => {
    const el = leafElementAt(8);
    elementFromPoint.mockReturnValue(el);
    const utils = await mount();
    emit({ type: "over", position: { x: 10, y: 10 } });
    utils.unmount();
    expect(hoisted.unlisten).toHaveBeenCalled();
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
    expect(hoisted.subscribe).toHaveBeenCalledOnce();
  });
});
