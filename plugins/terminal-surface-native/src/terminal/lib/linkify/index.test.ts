// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachLinkHandlers,
  LINK_OVERLAY_CLASS,
  type LinkifyDeps,
} from "./index";

/**
 * Fake grid: 8px cells, 16px rows, row 0 shows LINE.
 * LINE's URL spans cols 4..22 (endCol 23).
 */
const LINE = "run https://example.com now";
const URL = "https://example.com";
const CELL_W = 8;
const ROW_H = 16;

function makeDeps(overrides: Partial<LinkifyDeps> = {}): LinkifyDeps {
  return {
    pointToCell: (x, y) =>
      x < 0 || y < 0
        ? null
        : { col: Math.floor(x / CELL_W), row: Math.floor(y / ROW_H) },
    rowText: (row) => (row === 0 ? LINE : ""),
    metrics: () => ({ cellWidth: CELL_W, rowHeight: ROW_H }),
    openUrl: vi.fn(async () => {}),
    ...overrides,
  };
}

// col 10 / row 0 — squarely inside the URL.
const OVER_URL = { clientX: 10 * CELL_W + 4, clientY: 8 };
// col 0 / row 0 — the "run " prefix.
const OFF_URL = { clientX: 4, clientY: 8 };

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function flushRaf(): void {
  const batch = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const cb of batch) cb(0);
}

function overlayOf(host: HTMLElement): HTMLElement | null {
  return host.querySelector(`.${LINK_OVERLAY_CLASS}`);
}

function move(
  host: HTMLElement,
  at: { clientX: number; clientY: number },
): void {
  host.dispatchEvent(new MouseEvent("pointermove", at));
}

function click(
  host: HTMLElement,
  down: { clientX: number; clientY: number },
  up = down,
): void {
  host.dispatchEvent(new MouseEvent("pointerdown", down));
  host.dispatchEvent(new MouseEvent("click", up));
}

describe("attachLinkHandlers", () => {
  let host: HTMLElement;
  let dispose: (() => void) | null;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks.delete(id);
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    dispose = null;
  });

  afterEach(() => {
    dispose?.();
    host.remove();
    window.getSelection()?.removeAllRanges();
    vi.unstubAllGlobals();
  });

  it("underlines the URL under the pointer and shows a pointer cursor", () => {
    dispose = attachLinkHandlers(host, makeDeps());
    move(host, OVER_URL);
    flushRaf();

    const overlay = overlayOf(host);
    expect(overlay).not.toBeNull();
    expect(overlay?.style.left).toBe(`${4 * CELL_W}px`);
    expect(overlay?.style.top).toBe("0px");
    expect(overlay?.style.width).toBe(`${URL.length * CELL_W}px`);
    expect(overlay?.style.height).toBe(`${ROW_H}px`);
    expect(overlay?.style.pointerEvents).toBe("none");
    expect(host.style.cursor).toBe("pointer");
  });

  it("clears the underline and cursor when moving off the URL", () => {
    dispose = attachLinkHandlers(host, makeDeps());
    move(host, OVER_URL);
    flushRaf();
    expect(overlayOf(host)).not.toBeNull();

    move(host, OFF_URL);
    flushRaf();
    expect(overlayOf(host)).toBeNull();
    expect(host.style.cursor).toBe("");
  });

  it("coalesces pointermoves into one rAF hit-test", () => {
    dispose = attachLinkHandlers(host, makeDeps());
    move(host, OFF_URL);
    move(host, OVER_URL);
    expect(rafCallbacks.size).toBe(1);
    flushRaf();
    // The last coords win.
    expect(overlayOf(host)).not.toBeNull();
  });

  it("does not underline when metrics are unavailable", () => {
    dispose = attachLinkHandlers(host, makeDeps({ metrics: () => null }));
    move(host, OVER_URL);
    flushRaf();
    expect(overlayOf(host)).toBeNull();
    expect(host.style.cursor).toBe("");
  });

  it("clears the hover on pointerleave", () => {
    dispose = attachLinkHandlers(host, makeDeps());
    move(host, OVER_URL);
    flushRaf();
    host.dispatchEvent(new MouseEvent("pointerleave"));
    expect(overlayOf(host)).toBeNull();
    expect(host.style.cursor).toBe("");
  });

  it("clears the hover on wheel", () => {
    dispose = attachLinkHandlers(host, makeDeps());
    move(host, OVER_URL);
    flushRaf();
    host.dispatchEvent(new Event("wheel"));
    expect(overlayOf(host)).toBeNull();
  });

  it("opens the URL exactly once on a clean click", () => {
    const deps = makeDeps();
    dispose = attachLinkHandlers(host, deps);
    click(host, OVER_URL, {
      clientX: OVER_URL.clientX + 1,
      clientY: OVER_URL.clientY + 1,
    });
    expect(deps.openUrl).toHaveBeenCalledExactlyOnceWith(URL);
  });

  it("does not open on a 10px drag", () => {
    const deps = makeDeps();
    dispose = attachLinkHandlers(host, deps);
    click(host, OVER_URL, {
      clientX: OVER_URL.clientX + 10,
      clientY: OVER_URL.clientY,
    });
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it("does not open while a text selection is active", () => {
    const deps = makeDeps();
    dispose = attachLinkHandlers(host, deps);

    const text = document.createTextNode("selected text");
    document.body.appendChild(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    click(host, OVER_URL);
    expect(deps.openUrl).not.toHaveBeenCalled();
    text.remove();
  });

  it("does not open when the click lands outside a URL", () => {
    const deps = makeDeps();
    dispose = attachLinkHandlers(host, deps);
    click(host, OFF_URL);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it("swallows openUrl failures (async and sync)", async () => {
    const rejecting = makeDeps({
      openUrl: vi.fn(() => Promise.reject(new Error("nope"))),
    });
    dispose = attachLinkHandlers(host, rejecting);
    expect(() => click(host, OVER_URL)).not.toThrow();
    await Promise.resolve(); // let the rejection settle through the catch
    dispose();

    const throwing = makeDeps({
      openUrl: vi.fn(() => {
        throw new Error("nope");
      }),
    });
    dispose = attachLinkHandlers(host, throwing);
    expect(() => click(host, OVER_URL)).not.toThrow();
    expect(throwing.openUrl).toHaveBeenCalledOnce();
  });

  it("dispose removes the overlay and all listeners", () => {
    const deps = makeDeps();
    const disposeNow = attachLinkHandlers(host, deps);
    move(host, OVER_URL);
    flushRaf();
    expect(overlayOf(host)).not.toBeNull();

    disposeNow();
    expect(overlayOf(host)).toBeNull();
    expect(host.style.cursor).toBe("");

    move(host, OVER_URL);
    flushRaf();
    expect(overlayOf(host)).toBeNull();
    click(host, OVER_URL);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it("dispose cancels a pending rAF hit-test", () => {
    const disposeNow = attachLinkHandlers(host, makeDeps());
    move(host, OVER_URL);
    expect(rafCallbacks.size).toBe(1);
    disposeNow();
    expect(rafCallbacks.size).toBe(0);
  });
});
