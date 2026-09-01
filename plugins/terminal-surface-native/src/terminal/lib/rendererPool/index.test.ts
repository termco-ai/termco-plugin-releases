// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { engineSelectionText, warmEngineWasm } from "../engine";
import { serializeTerminal } from "../wtermSerialize";
import {
  readTerminalClipboard,
  writeTerminalClipboard,
} from "../terminalClipboard";
import { applyTerminalCssTheme } from "../../../terminalTheme";
import {
  type AcquireParams,
  acquireSlot,
  applyBackgroundActive,
  applyCursorBlink,
  applyFontFamily,
  applyFontSize,
  applyFontWeight,
  applyLetterSpacing,
  applyTheme,
  configureRendererPool,
  discardRetainedSlot,
  disposeLeafSlot,
  focusSlot,
  getLiveSlotForLeaf,
  getSlotForLeaf,
  isLeafAltScreen,
  POOL_MAX_SIZE,
  parkLeafSlot,
  pasteIntoLeaf,
  poolSize,
  poolSlotStats,
  refreshLeafSlot,
  releaseSlot,
  setSlotFocused,
} from "./index";

const h = vi.hoisted(() => {
  type FontStyle = {
    family: string;
    sizePx: number;
    weight: string;
    letterSpacing: number;
  };
  type EngineCall = [string, ...unknown[]];

  class FakeEngine {
    readonly host: HTMLElement;
    readonly ready = Promise.resolve();
    cols: number;
    rows: number;
    onData: (data: string) => void;
    calls: EngineCall[] = [];
    writes: Array<string | Uint8Array> = [];
    pastes: string[] = [];
    fontCalls: FontStyle[] = [];
    resetCount = 0;
    focusCount = 0;
    destroyed = false;
    stdinEnabled = true;
    altScreen = false;
    scrollback = 0;
    fitResult: { cols: number; rows: number } | null = null;

    constructor(
      host: HTMLElement,
      opts: {
        cols: number;
        rows: number;
        scrollbackBytes: number;
        onData: (data: string) => void;
      },
    ) {
      this.host = host;
      this.cols = opts.cols;
      this.rows = opts.rows;
      this.onData = opts.onData;
    }

    get element(): HTMLElement {
      return this.host;
    }
    core(): object | null {
      if (this.destroyed) return null;
      return {
        bracketedPaste: () => false,
        cursorKeysApp: () => false,
        getScrollbackCount: () => this.scrollback,
        getRows: () => this.rows,
        getCursor: () => ({ row: 0, col: 0, visible: true }),
      };
    }
    write(data: string | Uint8Array): void {
      this.writes.push(data);
      this.calls.push(["write", data]);
    }
    reset(): void {
      this.resetCount += 1;
      this.calls.push(["reset"]);
    }
    resize(cols: number, rows: number): void {
      this.cols = cols;
      this.rows = rows;
      this.calls.push(["resize", cols, rows]);
    }
    fit(w: number, hpx: number): { cols: number; rows: number } | null {
      this.calls.push(["fit", w, hpx]);
      return this.fitResult;
    }
    focus(): void {
      this.focusCount += 1;
    }
    paste(text: string): void {
      this.pastes.push(text);
    }
    destroy(): void {
      this.destroyed = true;
    }
    setStdinEnabled(enabled: boolean): void {
      this.stdinEnabled = enabled;
      this.calls.push(["stdin", enabled]);
    }
    setBlocksDirty(): void {
      this.calls.push(["blocksDirty"]);
    }
    applyFont(style: FontStyle): void {
      this.fontCalls.push(style);
    }
    usingAltScreen(): boolean {
      return this.altScreen;
    }
    cursorKeysApp(): boolean {
      return false;
    }
    scrollbackCount(): number {
      return this.scrollback;
    }
    getBufferTail(): string {
      return "";
    }
    viewportHasGlyphs(): boolean {
      return false;
    }
    pointToCell(): null {
      return null;
    }
    invalidateMetrics(): void {}
    inputTextarea(): null {
      return null;
    }
    clear(): void {}
  }
  return { FakeEngine };
});

type Fake = InstanceType<typeof h.FakeEngine>;

vi.mock("../engine", () => ({
  TerminalEngine: h.FakeEngine,
  serializeLite: vi.fn(() => ({ data: "SNAP", lines: 3 })),
  warmEngineWasm: vi.fn(),
  encodeMouseEvent: vi.fn(() => null),
  wheelFallbackSequence: vi.fn(() => "\x1b[A"),
  engineSelectionText: vi.fn(() => ""),
  bufferLineText: vi.fn(() => ""),
}));
vi.mock("../wtermSerialize", () => ({
  serializeTerminal: vi.fn(() => ({ data: "SNAP", lines: 3 })),
}));
vi.mock("../linkify", () => ({
  attachLinkHandlers: vi.fn(() => () => {}),
}));
vi.mock("../../../terminalTheme", () => ({
  applyTerminalCssTheme: vi.fn(),
  terminalPalette: vi.fn(() => ({})),
}));
vi.mock("../../../fonts", () => ({
  resolveFontFamily: (f: string) => `resolved:${f}`,
}));
vi.mock("../terminalClipboard", () => ({
  readTerminalClipboard: vi.fn(() => Promise.resolve("clip")),
  writeTerminalClipboard: vi.fn(() => Promise.resolve()),
}));

const prefs = {
  terminalFontFamily: "mono",
  terminalFontWeight: "400",
  terminalLetterSpacing: 0,
  terminalFontSize: 14,
  zoomLevel: 1,
  terminalScrollback: 1000,
};
vi.mock("../../../preferences", () => ({
  usePreferencesStore: { getState: () => prefs },
}));

function eng(leafId: number): Fake {
  const slot = getLiveSlotForLeaf(leafId);
  if (!slot) throw new Error(`no slot for leaf ${leafId}`);
  return slot.engine as unknown as Fake;
}

type LeafCfg = {
  visible?: boolean;
  busy?: boolean;
  blocks?: boolean;
  focused?: boolean;
};
const leafCfg = new Map<number, LeafCfg>();
type Bridge = {
  writeToPty: ReturnType<typeof vi.fn<(data: string) => void>>;
  resizePty: ReturnType<typeof vi.fn<(cols: number, rows: number) => void>>;
  kickPty: ReturnType<typeof vi.fn<(cols: number, rows: number) => void>>;
  getDecModes: ReturnType<typeof vi.fn<() => null>>;
};
const bridges = new Map<number, Bridge>();
const evictLeaf = vi.fn();
const storeSnapshot = vi.fn();

function ensureBridge(leafId: number): Bridge {
  let b = bridges.get(leafId);
  if (!b) {
    b = {
      writeToPty: vi.fn(),
      resizePty: vi.fn(),
      kickPty: vi.fn(),
      getDecModes: vi.fn(() => null),
    };
    bridges.set(leafId, b);
  }
  return b;
}

function params(
  leafId: number,
  over: Partial<AcquireParams> = {},
): AcquireParams {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    leafId,
    container,
    snapshot: null,
    altScreen: false,
    drainRing: () => {},
    shellExited: false,
    cols: 0,
    rows: 0,
    ...over,
  };
}

function keydown(
  init: KeyboardEventInit & { keyCode?: number; composing?: boolean },
): KeyboardEvent {
  const { keyCode, composing, ...rest } = init;
  const e = new KeyboardEvent("keydown", {
    cancelable: true,
    bubbles: true,
    ...rest,
  });
  if (keyCode !== undefined) {
    Object.defineProperty(e, "keyCode", { value: keyCode });
  }
  if (composing !== undefined) {
    Object.defineProperty(e, "isComposing", { value: composing });
  }
  return e;
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // jsdom only exposes rAF with pretendToBeVisual; the pool needs it for
  // its unhide-after-paint dance.
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  configureRendererPool({
    resolveLeaf: (id) => bridges.get(id) ?? null,
    evictLeaf,
    isLeafFocused: (id) => leafCfg.get(id)?.focused ?? false,
    isLeafBlocks: (id) => leafCfg.get(id)?.blocks ?? false,
    isLeafBusy: (id) => leafCfg.get(id)?.busy ?? false,
    isLeafVisible: (id) => leafCfg.get(id)?.visible ?? false,
    storeSnapshot,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("slot pooling", () => {
  it("refits a newly bound slot after its async engine becomes ready", async () => {
    const leafId = 99;
    ensureBridge(leafId);
    const p = params(leafId);
    Object.defineProperties(p.container, {
      clientWidth: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 700 },
    });
    const slot = acquireSlot(p);
    const engine = eng(leafId);
    const fitsBeforeReady = engine.calls.filter(([name]) => name === "fit");

    try {
      await slot.engine.ready;
      await Promise.resolve();

      const fitsAfterReady = engine.calls.filter(([name]) => name === "fit");
      expect(fitsAfterReady.length).toBeGreaterThan(fitsBeforeReady.length);
      expect(fitsAfterReady[fitsAfterReady.length - 1]).toEqual([
        "fit",
        900,
        700,
      ]);
    } finally {
      disposeLeafSlot(leafId);
    }
  });

  it("creates one slot per leaf up to POOL_MAX_SIZE and warms the wasm", () => {
    expect(POOL_MAX_SIZE).toBe(5);
    for (const id of [1, 2, 3, 4, 5]) {
      ensureBridge(id);
      acquireSlot(params(id));
      expect(getSlotForLeaf(id)?.currentLeafId).toBe(id);
    }
    expect(poolSize()).toBe(5);
    const ids = new Set([1, 2, 3, 4, 5].map((id) => getSlotForLeaf(id)?.id));
    expect(ids.size).toBe(5);
    expect(vi.mocked(warmEngineWasm)).toHaveBeenCalled();
  });

  it("binds with stdin enabled and the host inside the container", () => {
    const slot = getSlotForLeaf(1);
    expect(eng(1).stdinEnabled).toBe(true);
    expect(slot?.host.parentElement?.tagName).toBe("DIV");
    expect(document.body.contains(slot?.host ?? null)).toBe(true);
  });

  it("rewires an already-bound leaf into a new container without a new slot", () => {
    const before = getSlotForLeaf(1);
    const resets = eng(1).resetCount;
    const p = params(1);
    const same = acquireSlot(p);
    expect(same).toBe(before);
    expect(same.host.parentNode).toBe(p.container);
    expect(poolSize()).toBe(5);
    expect(eng(1).resetCount).toBe(resets);
  });

  it("releaseSlot retains the buffer and parks the host", () => {
    const out = releaseSlot(5);
    expect(out).toEqual({ cols: 80, rows: 24 });
    expect(getSlotForLeaf(5)).toBeNull();
    const live = getLiveSlotForLeaf(5);
    expect(live?.retainedLeafId).toBe(5);
    expect(live?.currentLeafId).toBeNull();
    expect(live?.parked).toBe(true);
    expect(live?.host.style.display).toBe("none");
  });

  it("releaseSlot returns null for an unbound leaf", () => {
    expect(releaseSlot(999)).toBeNull();
  });

  it("fast-rebinds a retained leaf: no reset, no snapshot replay, ring drained", () => {
    const e = eng(5);
    const resets = e.resetCount;
    const writesBefore = e.writes.length;
    storeSnapshot.mockClear();
    const ring = new Uint8Array([65, 66]);
    const slot = acquireSlot(
      params(5, { snapshot: "STALE", drainRing: (write) => write(ring) }),
    );
    expect(slot.currentLeafId).toBe(5);
    expect(slot.retainedLeafId).toBeNull();
    expect(slot.parked).toBe(false);
    expect(e.resetCount).toBe(resets);
    expect(storeSnapshot).not.toHaveBeenCalled();
    expect(e.writes.slice(writesBefore)).toEqual([ring]);
  });

  it("a new leaf steals the retained slot and serializes its buffer first", () => {
    releaseSlot(5);
    const e = eng(5);
    const resets = e.resetCount;
    ensureBridge(6);
    storeSnapshot.mockClear();
    const slot = acquireSlot(params(6));
    expect(poolSize()).toBe(5);
    expect(storeSnapshot).toHaveBeenCalledWith(5, {
      snapshot: "SNAP",
      lines: 3,
      cols: 80,
      rows: 24,
      altScreen: false,
    });
    expect(vi.mocked(serializeTerminal)).toHaveBeenCalled();
    expect(slot.currentLeafId).toBe(6);
    expect(getLiveSlotForLeaf(5)).toBeNull();
    expect(e.resetCount).toBeGreaterThan(resets);
  });

  it("evicts the idle hidden leaf when every slot is bound", () => {
    leafCfg.set(1, { visible: true, focused: true });
    leafCfg.set(2, {});
    leafCfg.set(3, { busy: true });
    leafCfg.set(4, { blocks: true });
    leafCfg.set(6, { visible: true });
    ensureBridge(7);
    evictLeaf.mockClear();
    acquireSlot(params(7));
    expect(evictLeaf).toHaveBeenCalledWith(2);
    expect(getSlotForLeaf(2)).toBeNull();
    expect(getSlotForLeaf(7)?.currentLeafId).toBe(7);
    expect(poolSize()).toBe(5);
  });

  it("prefers a foreground-job leaf over an idle one for keeping its slot", () => {
    // 7 is now the only hidden idle leaf; hidden-but-busy 3 must survive.
    leafCfg.set(7, {});
    ensureBridge(8);
    evictLeaf.mockClear();
    acquireSlot(params(8));
    expect(evictLeaf).toHaveBeenCalledWith(7);
    expect(getSlotForLeaf(3)?.currentLeafId).toBe(3);
  });
});

describe("bind side effects", () => {
  it("cold bind runs reset, resize, snapshot, ring, cursor-show in order", () => {
    releaseSlot(8);
    const e = eng(8); // retained slot that leaf 9 is about to steal
    e.calls.length = 0;
    ensureBridge(9);
    const ring = new Uint8Array([65, 66]);
    acquireSlot(
      params(9, {
        snapshot: "SNAP-IN",
        drainRing: (write) => write(ring),
        cols: 100,
        rows: 30,
      }),
    );
    const seq = e.calls.filter(([m]) =>
      ["reset", "resize", "write"].includes(m),
    );
    expect(seq).toEqual([
      ["reset"],
      ["resize", 100, 30],
      ["write", "SNAP-IN"],
      ["write", ring],
      ["write", "\x1b[?25h"],
    ]);
  });

  it("skips ring replay and kicks the PTY for an alt-screen rebind", () => {
    releaseSlot(9);
    const e = eng(9);
    e.writes.length = 0;
    const bridge = ensureBridge(10);
    acquireSlot(
      params(10, {
        altScreen: true,
        drainRing: (write) => write(new Uint8Array([1])),
      }),
    );
    expect(eng(10)).toBe(e);
    expect(e.writes.some((w) => w instanceof Uint8Array)).toBe(false);
    expect(e.writes).toContain("\x1b[?25h");
    expect(bridge.kickPty).toHaveBeenCalledWith(e.cols, e.rows);
  });

  it("does not kick the PTY and disables stdin when the shell exited", () => {
    releaseSlot(10);
    const bridge = ensureBridge(11);
    acquireSlot(params(11, { altScreen: true, shellExited: true }));
    expect(bridge.kickPty).not.toHaveBeenCalled();
    expect(eng(11).stdinEnabled).toBe(false);
    expect(eng(11).calls).toContainEqual(["stdin", false]);
  });
});

describe("pasteIntoLeaf", () => {
  it("routes to the bound slot's engine paste", () => {
    expect(pasteIntoLeaf(11, "/tmp/file.txt ")).toBe(true);
    expect(eng(11).pastes).toContain("/tmp/file.txt ");
  });

  it("returns false for an unbound leaf", () => {
    expect(pasteIntoLeaf(4242, "x")).toBe(false);
  });
});

describe("terminal input", () => {
  it("forwards engine data to the leaf's PTY bridge", () => {
    const bridge = ensureBridge(11);
    bridge.writeToPty.mockClear();
    eng(11).onData("ls\r");
    expect(bridge.writeToPty).toHaveBeenCalledWith("ls\r");
  });

  it("drops data when the slot is unbound", () => {
    const bridge = ensureBridge(11);
    const e = eng(11);
    releaseSlot(11);
    bridge.writeToPty.mockClear();
    expect(() => e.onData("zombie")).not.toThrow();
    expect(bridge.writeToPty).not.toHaveBeenCalled();
    acquireSlot(params(11));
  });
});

describe("appearance appliers", () => {
  it("applyFontSize funnels prefs into engine.applyFont and refits live slots", () => {
    const bridge = ensureBridge(11);
    bridge.resizePty.mockClear();
    prefs.terminalFontSize = 20;
    applyFontSize(20);
    const e = eng(11);
    expect(e.fontCalls[e.fontCalls.length - 1]).toEqual({
      family: "resolved:mono",
      sizePx: 20,
      weight: "400",
      letterSpacing: 0,
    });
    expect(bridge.resizePty).toHaveBeenCalledWith(e.cols, e.rows);
  });

  it("poisons the cached width of parked slots instead of refitting", () => {
    releaseSlot(11);
    const slot = getLiveSlotForLeaf(11);
    expect(slot).not.toBeNull();
    const fontsBefore = eng(11).fontCalls.length;
    applyFontSize(22);
    expect(slot?.lastW).toBe(-1);
    // The font still lands on the parked engine.
    expect(eng(11).fontCalls.length).toBe(fontsBefore + 1);
    acquireSlot(params(11));
  });

  it("applies letter spacing, font family and weight through applyFont", () => {
    prefs.terminalLetterSpacing = 2;
    applyLetterSpacing(2);
    prefs.terminalFontFamily = "Fira Code";
    applyFontFamily("Fira Code");
    prefs.terminalFontWeight = "700";
    applyFontWeight("700");
    const fonts = eng(11).fontCalls;
    expect(fonts[fonts.length - 1]).toEqual({
      family: "resolved:Fira Code",
      sizePx: 20,
      weight: "700",
      letterSpacing: 2,
    });
  });

  it("applyTheme writes the CSS theme to the root and inline per slot host", () => {
    // The .wterm class on each host declares its own --term-* defaults,
    // so root-level vars alone are shadowed — every host needs inline vars.
    vi.mocked(applyTerminalCssTheme).mockClear();
    applyTheme();
    const calls = vi.mocked(applyTerminalCssTheme).mock.calls;
    expect(calls[0]).toEqual([]);
    const hostCalls = calls.slice(1);
    expect(hostCalls.length).toBe(poolSize());
    for (const c of hostCalls) {
      expect(c[0]).toBeInstanceOf(HTMLElement);
    }
  });

  it("applyBackgroundActive toggles the backdrop class on the root", () => {
    applyBackgroundActive(true);
    expect(
      document.documentElement.classList.contains("terminal-bg-image"),
    ).toBe(true);
    applyBackgroundActive(false);
    expect(
      document.documentElement.classList.contains("terminal-bg-image"),
    ).toBe(false);
  });
});

describe("cursor blink and focus", () => {
  const blinks = (leafId: number) =>
    eng(leafId).element.classList.contains("cursor-blink");

  it("enables blink only for the focused leaf while the window is active", () => {
    // jsdom may report an unfocused document at module load; force active.
    const spy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    spy.mockRestore();
    leafCfg.set(11, { visible: true, focused: true });
    leafCfg.set(1, { visible: true, focused: false });
    applyCursorBlink(true);
    expect(blinks(11)).toBe(true);
    expect(blinks(1)).toBe(false);
  });

  it("clears blink when the window loses focus", () => {
    const spy = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    expect(blinks(11)).toBe(false);
    spy.mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    expect(blinks(11)).toBe(true);
    spy.mockRestore();
  });

  it("setSlotFocused flips blink per slot", () => {
    setSlotFocused(11, false);
    expect(blinks(11)).toBe(false);
    setSlotFocused(11, true);
    expect(blinks(11)).toBe(true);
    expect(() => setSlotFocused(4242, true)).not.toThrow();
  });

  it("focusSlot focuses the bound engine", () => {
    const before = eng(11).focusCount;
    focusSlot(11);
    expect(eng(11).focusCount).toBe(before + 1);
  });
});

describe("alt screen and parking helpers", () => {
  it("reports alt-screen state from the engine", () => {
    expect(isLeafAltScreen(11)).toBe(false);
    eng(11).altScreen = true;
    expect(isLeafAltScreen(11)).toBe(true);
    eng(11).altScreen = false;
    expect(isLeafAltScreen(4242)).toBe(false);
  });

  it("parkLeafSlot hides the host while keeping the leaf bound", () => {
    parkLeafSlot(11);
    const slot = getSlotForLeaf(11);
    expect(slot?.parked).toBe(true);
    expect(slot?.host.style.display).toBe("none");
    expect(slot?.currentLeafId).toBe(11);
  });

  it("refreshLeafSlot unparks", () => {
    refreshLeafSlot(11);
    const slot = getSlotForLeaf(11);
    expect(slot?.parked).toBe(false);
    expect(slot?.host.style.display).toBe("");
    expect(() => refreshLeafSlot(4242)).not.toThrow();
  });
});

describe("input interceptor", () => {
  const host = () => {
    const slot = getSlotForLeaf(11);
    if (!slot) throw new Error("leaf 11 not bound");
    return slot.host;
  };

  it("maps Shift+Enter to ESC CR and claims the event", () => {
    const bridge = ensureBridge(11);
    bridge.writeToPty.mockClear();
    const e = keydown({ key: "Enter", shiftKey: true });
    const stop = vi.spyOn(e, "stopPropagation");
    host().dispatchEvent(e);
    expect(bridge.writeToPty).toHaveBeenCalledWith("\x1b\r");
    expect(e.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it("never intercepts IME composition keystrokes", () => {
    const bridge = ensureBridge(11);
    bridge.writeToPty.mockClear();
    const composing = keydown({
      key: "Enter",
      shiftKey: true,
      composing: true,
    });
    host().dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(false);
    const ime = keydown({ key: "a", keyCode: 229 });
    host().dispatchEvent(ime);
    expect(ime.defaultPrevented).toBe(false);
    expect(bridge.writeToPty).not.toHaveBeenCalled();
  });

  it("sends readline word navigation for Alt+Arrow", () => {
    const bridge = ensureBridge(11);
    bridge.writeToPty.mockClear();
    host().dispatchEvent(keydown({ key: "ArrowLeft", altKey: true }));
    expect(bridge.writeToPty).toHaveBeenCalledWith("\x1bb");
    host().dispatchEvent(keydown({ key: "ArrowRight", altKey: true }));
    expect(bridge.writeToPty).toHaveBeenCalledWith("\x1bf");
  });

  it("copies the engine selection on Ctrl+Shift+C", () => {
    vi.mocked(engineSelectionText).mockReturnValueOnce("picked text");
    const e = keydown({ ctrlKey: true, shiftKey: true, code: "KeyC" });
    host().dispatchEvent(e);
    expect(writeTerminalClipboard).toHaveBeenCalledWith("picked text");
    expect(e.defaultPrevented).toBe(true);
  });

  it("swallows Ctrl+Shift+C without a selection and skips the clipboard", () => {
    vi.mocked(writeTerminalClipboard).mockClear();
    const e = keydown({ ctrlKey: true, shiftKey: true, code: "KeyC" });
    host().dispatchEvent(e);
    expect(writeTerminalClipboard).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("pastes the clipboard on Ctrl+Shift+V", async () => {
    vi.mocked(readTerminalClipboard).mockResolvedValue("from clipboard");
    const e = keydown({ ctrlKey: true, shiftKey: true, code: "KeyV" });
    host().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(eng(11).pastes).toContain("from clipboard");
  });

  it("ignores keys when the leaf has no bridge", () => {
    const saved = bridges.get(11);
    bridges.delete(11);
    const e = keydown({ key: "ArrowLeft", altKey: true });
    expect(() => host().dispatchEvent(e)).not.toThrow();
    expect(e.defaultPrevented).toBe(false);
    if (saved) bridges.set(11, saved);
  });
});

describe("poolSlotStats", () => {
  it("describes each slot for debugging", () => {
    eng(11).scrollback = 5;
    const stats = poolSlotStats();
    expect(stats).toHaveLength(poolSize());
    const bound = stats.find((s) => s.leafId === 11);
    expect(bound).toEqual({
      id: expect.any(Number),
      leafId: 11,
      retainedLeafId: null,
      parked: false,
      cols: eng(11).cols,
      rows: eng(11).rows,
      bufferLines: eng(11).rows + 5,
    });
  });
});

describe("slot disposal", () => {
  it("discardRetainedSlot wipes a retained buffer in place", () => {
    releaseSlot(11);
    const e = eng(11);
    const resets = e.resetCount;
    discardRetainedSlot(11);
    expect(getLiveSlotForLeaf(11)).toBeNull();
    expect(e.resetCount).toBe(resets + 1);
    expect(() => discardRetainedSlot(11)).not.toThrow();
  });

  it("disposeLeafSlot destroys the engine and removes the host", () => {
    const before = poolSize();
    const e = eng(1);
    const host = getSlotForLeaf(1)?.host;
    disposeLeafSlot(1);
    expect(poolSize()).toBe(before - 1);
    expect(e.destroyed).toBe(true);
    expect(host?.isConnected).toBe(false);
    expect(getLiveSlotForLeaf(1)).toBeNull();
  });

  it("reaps surplus idle slots after the grace period, serializing retained buffers", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      releaseSlot(3);
      releaseSlot(4);
      const before = poolSize();
      storeSnapshot.mockClear();
      vi.advanceTimersByTime(45_000);
      // Each slot reaps only itself: the first-fired timer sees three idle
      // slots and disposes its own (a surplus one); the retained buffer is
      // serialized before disposal.
      expect(poolSize()).toBe(before - 1);
      expect(storeSnapshot).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ snapshot: "SNAP" }),
      );
      expect(getLiveSlotForLeaf(3)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
