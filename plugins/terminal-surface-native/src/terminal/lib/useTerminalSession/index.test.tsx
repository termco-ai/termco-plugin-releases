// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The renderer pool runs REAL against a fake TerminalEngine (the wterm
// facade is the only engine boundary now); pool exports the session module
// asserts on are wrapped in pass-through spies. The stream parser, line
// space and OSC handlers also run real — PTY bytes fed through the fake
// pty flow through the actual parser into the fake engine's write spy.
const engineState = vi.hoisted(() => {
  type EngineOpts = {
    cols: number;
    rows: number;
    scrollbackBytes: number;
    onData: (data: string) => void;
  };

  const instances: unknown[] = [];

  class FakeTerminalEngine {
    host: HTMLElement;
    ready = Promise.resolve();
    cols: number;
    rows: number;
    onData: (data: string) => void;
    write = vi.fn();
    reset = vi.fn();
    clear = vi.fn();
    focus = vi.fn();
    destroy = vi.fn();
    paste = vi.fn();
    applyFont = vi.fn();
    invalidateMetrics = vi.fn();
    setStdinEnabled = vi.fn();
    setBlocks = vi.fn();
    setBlocksDirty = vi.fn();
    fit = vi.fn((): { cols: number; rows: number } | null => null);
    resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
    });
    usingAltScreen = vi.fn(() => false);
    cursorKeysApp = vi.fn(() => false);
    scrollbackCount = vi.fn(() => 0);
    viewportHasGlyphs = vi.fn(() => false);
    getBufferTail = vi.fn(() => "");
    pointToCell = vi.fn(() => null);
    inputTextarea = vi.fn(() => null);
    // parserSink tolerates a null core: buffer-line context degrades to 0.
    core = vi.fn(() => null);

    constructor(host: HTMLElement, opts: EngineOpts) {
      this.host = host;
      this.cols = opts.cols;
      this.rows = opts.rows;
      this.onData = opts.onData;
      instances.push(this);
    }

    get element(): HTMLElement {
      return this.host;
    }

    get isReady(): boolean {
      return true;
    }
  }

  return { FakeTerminalEngine, instances };
});

type FakeEngine = InstanceType<typeof engineState.FakeTerminalEngine>;

const pool = vi.hoisted(() => ({
  adapter: null as import("../rendererPool").SlotAdapter | null,
}));

const agent = vi.hoisted(() => ({
  exitedCb: null as ((ptyId: number) => void) | null,
  active: new Set<number>(),
}));

vi.mock("../engine", () => ({
  TerminalEngine: engineState.FakeTerminalEngine,
  warmEngineWasm: vi.fn(),
  serializeLite: vi.fn(() => ({ data: "", lines: 0 })),
  engineSelectionText: vi.fn(() => null),
  encodeMouseEvent: vi.fn(() => null),
  wheelFallbackSequence: vi.fn(() => "\x1b[A"),
}));

vi.mock("../rendererPool", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rendererPool")>();
  return {
    ...real,
    configureRendererPool: vi.fn((a: import("../rendererPool").SlotAdapter) => {
      pool.adapter = a;
      real.configureRendererPool(a);
    }),
    acquireSlot: vi.fn(real.acquireSlot),
    releaseSlot: vi.fn(real.releaseSlot),
    parkLeafSlot: vi.fn(real.parkLeafSlot),
  };
});

vi.mock("../../../terminalTheme", () => ({
  applyTerminalCssTheme: vi.fn(),
  terminalPalette: vi.fn(() => ({})),
}));

vi.mock("../pty-bridge", () => ({ openPty: vi.fn() }));

vi.mock("../agentActivity", () => ({
  ensureAgentActivityListener: vi.fn((cb: (ptyId: number) => void) => {
    agent.exitedCb = cb;
  }),
  isAgentActivePty: vi.fn((id: number) => agent.active.has(id)),
}));

vi.mock("../../../fonts", () => ({
  ensureMonoFontsLoaded: vi.fn(() => Promise.resolve()),
  resolveFontFamily: vi.fn((family: string) => family || "monospace"),
}));

vi.mock("../../../preferences", async () => {
  const { create } = await import("zustand");
  const usePreferencesStore = create(() => ({
    terminalFontSize: 14,
    zoomLevel: 1,
    terminalFontFamily: "mono",
    terminalFontWeight: "400",
    terminalLetterSpacing: 0,
    terminalScrollback: 1000,
    terminalCursorBlink: false,
    backgroundKind: "none",
    backgroundImageId: null,
    terminalShell: "",
  }));
  return { usePreferencesStore };
});

import {
  configureTerminalRuntime,
  type TerminalRuntime,
  type WorkspaceEnv,
} from "../../../runtime";
import { engineSelectionText } from "../engine";
import { openPty } from "../pty-bridge";
import {
  acquireSlot,
  discardRetainedSlot,
  getLiveSlotForLeaf,
  getSlotForLeaf,
  parkLeafSlot,
  releaseSlot,
} from "../rendererPool";
import {
  blockWatermarkState,
  clearFocusedTerminal,
  disposeSession,
  focusLeafInput,
  getLeafBlockMode,
  getLeafDraft,
  interruptLeaf,
  leafCwd,
  leafGridSelection,
  leafHasForegroundProcess,
  leafIdForPty,
  navigateFocusedBlocks,
  setLeafDraft,
  setLeafInputFocus,
  setLeafInputActivity,
  submitToLeaf,
  subscribeLeafBlockMode,
  terminalDebugStats,
  useTerminalSession,
  whenSessionReady,
  writeToSession,
} from "./index";
import type { Options } from "./types";

type FakePty = {
  id: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type PtyHandlers = {
  onData: (bytes: Uint8Array) => void;
  onExit?: (code: number) => void;
};

let nextPtyId = 100;
const spawned: Array<{ pty: FakePty; handlers: PtyHandlers; cwd?: string }> =
  [];

function defaultOpenPty(
  _cols: number,
  _rows: number,
  handlers: PtyHandlers,
  _workspace: WorkspaceEnv,
  cwd?: string,
): Promise<FakePty> {
  nextPtyId += 1;
  const pty: FakePty = {
    id: nextPtyId,
    write: vi.fn(() => Promise.resolve()),
    resize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  spawned.push({ pty, handlers, cwd });
  return Promise.resolve(pty);
}

const openPtyMock = vi.mocked(openPty);

const enc = new TextEncoder();
const dec = new TextDecoder();

function engineFor(leafId: number): FakeEngine {
  const slot = getLiveSlotForLeaf(leafId);
  if (!slot) throw new Error(`no live slot for leaf ${leafId}`);
  return slot.engine as unknown as FakeEngine;
}

/** All bytes/strings the engine received, decoded and concatenated. */
function writtenText(engine: FakeEngine): string {
  return engine.write.mock.calls
    .map(([chunk]) =>
      typeof chunk === "string" ? chunk : dec.decode(chunk as Uint8Array),
    )
    .join("");
}

/** Feed raw bytes through the fake PTY, i.e. through the real stream parser. */
function ptyEmits(text: string, idx = 0): void {
  spawned[idx].handlers.onData(enc.encode(text));
}

/** OSC escape for shell-integration sequences, e.g. emitOsc(133, "C;cmd"). */
function emitOsc(code: number, data: string, idx = 0): void {
  ptyEmits(`\x1b]${code};${data}\x07`, idx);
}

/**
 * Simulate the slot being stolen for another leaf: unbind the session and
 * drop the retained buffer so getLiveSlotForLeaf() goes null.
 */
function dropSlot(leafId: number): void {
  pool.adapter?.evictLeaf(leafId);
  discardRetainedSlot(leafId);
}

let sessionApi: ReturnType<typeof useTerminalSession> | null = null;

function Host({
  workspace = { kind: "local" },
  ...props
}: Omit<Options, "container" | "workspace"> & { workspace?: WorkspaceEnv }) {
  const ref = useRef<HTMLDivElement>(null);
  sessionApi = useTerminalSession({ ...props, workspace, container: ref });
  return <div ref={ref} />;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

let nextLeaf = 1;
function freshLeaf(): number {
  nextLeaf += 1;
  return nextLeaf;
}

async function mountLeaf(
  leafId: number,
  over: Partial<Omit<Options, "container" | "leafId">> = {},
) {
  const utils = render(<Host leafId={leafId} visible {...over} />);
  await flush();
  return utils;
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const ptyRuntime = {
  hasForegroundJob: vi.fn(() => Promise.resolve(false)),
  hasForegroundProcess: vi.fn(() => Promise.resolve(false)),
};
let disposeTerminalRuntime: (() => void) | null = null;

beforeAll(() => {
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // jsdom only exposes rAF with pretendToBeVisual; the pool needs it for
  // its unhide-after-paint dance.
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  disposeTerminalRuntime = configureTerminalRuntime({
    pty: ptyRuntime,
  } as unknown as TerminalRuntime);
  ptyRuntime.hasForegroundJob.mockReset();
  ptyRuntime.hasForegroundJob.mockResolvedValue(false);
  ptyRuntime.hasForegroundProcess.mockReset();
  ptyRuntime.hasForegroundProcess.mockResolvedValue(false);
  spawned.length = 0;
  agent.active.clear();
  openPtyMock.mockReset();
  openPtyMock.mockImplementation(defaultOpenPty as unknown as typeof openPty);
  vi.mocked(acquireSlot).mockClear();
  vi.mocked(releaseSlot).mockClear();
  vi.mocked(parkLeafSlot).mockClear();
  // Idle pool slots (and their engines) survive across tests by design;
  // wipe their spy history so per-test call assertions start clean.
  for (const e of engineState.instances as FakeEngine[]) {
    for (const value of Object.values(e)) {
      if (typeof value === "function" && "mockClear" in value) {
        (value as ReturnType<typeof vi.fn>).mockClear();
      }
    }
  }
});

afterEach(() => {
  sessionApi = null;
  disposeTerminalRuntime?.();
  disposeTerminalRuntime = null;
});

describe("session lifecycle", () => {
  it("binds a slot, spawns the PTY with the seeded cwd and hands out the stub search handle", async () => {
    const leaf = freshLeaf();
    const onSearchReady = vi.fn();
    const utils = await mountLeaf(leaf, { initialCwd: "/seed", onSearchReady });
    expect(acquireSlot).toHaveBeenCalledWith(
      expect.objectContaining({ leafId: leaf }),
    );
    expect(getSlotForLeaf(leaf)).not.toBeNull();
    expect(openPtyMock).toHaveBeenCalledTimes(1);
    expect(spawned[0]?.cwd).toBe("/seed");
    // Search is session-scoped now: bind delivers the (stub) handle.
    expect(onSearchReady).toHaveBeenCalledTimes(1);
    const handle = onSearchReady.mock.calls[0][0];
    expect(handle.findNext("x")).toBe(false);
    expect(handle.findPrevious("x")).toBe(false);
    expect(() => handle.clearDecorations()).not.toThrow();
    utils.unmount();
    disposeSession(leaf);
  });

  it("queues input typed before the PTY attaches and flushes it on attach", async () => {
    const leaf = freshLeaf();
    let resolvePty: (p: FakePty) => void = () => {};
    openPtyMock.mockImplementation((_c, _r, handlers) => {
      return new Promise((r) => {
        resolvePty = (p) => {
          spawned.push({ pty: p, handlers: handlers as PtyHandlers });
          r(p as never);
        };
      });
    });
    const utils = render(<Host leafId={leaf} visible />);
    await flush();
    expect(writeToSession(leaf, "early ")).toBe(true);
    expect(writeToSession(leaf, "input")).toBe(true);
    const pty: FakePty = {
      id: ++nextPtyId,
      write: vi.fn(() => Promise.resolve()),
      resize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
    };
    resolvePty(pty);
    await flush();
    expect(pty.write).toHaveBeenCalledWith("early input");
    utils.unmount();
    disposeSession(leaf);
  });

  it("caps the pending-input queue so huge pastes cannot grow unbounded", async () => {
    const leaf = freshLeaf();
    openPtyMock.mockImplementation(() => new Promise(() => {}));
    const utils = render(<Host leafId={leaf} visible />);
    await flush();
    writeToSession(leaf, "a".repeat(200 * 1024));
    writeToSession(leaf, "b".repeat(100 * 1024));
    writeToSession(leaf, "c");
    const stats = terminalDebugStats();
    const s = stats.sessions.find((x) => x.leafId === leaf);
    expect(s).toBeDefined();
    utils.unmount();
    disposeSession(leaf);
  });

  it("returns false when writing to an unknown leaf", () => {
    expect(writeToSession(987654, "x")).toBe(false);
  });

  it("reports exit through onExit, blocks further writes and disables stdin", async () => {
    const leaf = freshLeaf();
    const onExit = vi.fn();
    const utils = await mountLeaf(leaf, { onExit });
    await act(async () => {
      spawned[0].handlers.onExit?.(2);
    });
    expect(onExit).toHaveBeenCalledWith(2);
    expect(writeToSession(leaf, "x")).toBe(false);
    expect(engineFor(leaf).setStdinEnabled).toHaveBeenLastCalledWith(false);
    utils.unmount();
    disposeSession(leaf);
  });

  it("disposeSession closes the PTY and forgets the leaf", async () => {
    const leaf = freshLeaf();
    const onExit = vi.fn();
    const utils = await mountLeaf(leaf, { onExit });
    const pty = spawned[0].pty;
    disposeSession(leaf);
    await act(async () => {
      spawned[0].handlers.onExit?.(0);
    });
    expect(pty.close).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(writeToSession(leaf, "x")).toBe(false);
    expect(blockWatermarkState(leaf)).toBe("dead");
    utils.unmount();
  });
});

describe("command submission", () => {
  it("submits a single-line command with a trailing CR", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    submitToLeaf(leaf, "ls -la");
    expect(spawned[0].pty.write).toHaveBeenCalledWith("ls -la\r");
    utils.unmount();
    disposeSession(leaf);
  });

  it("wraps multiline commands in bracketed paste", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    submitToLeaf(leaf, "line1\nline2");
    expect(spawned[0].pty.write).toHaveBeenCalledWith(
      "\x1b[200~line1\nline2\x1b[201~\r",
    );
    utils.unmount();
    disposeSession(leaf);
  });

  it("interruptLeaf sends ETX", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    interruptLeaf(leaf);
    expect(spawned[0].pty.write).toHaveBeenCalledWith("\x03");
    utils.unmount();
    disposeSession(leaf);
  });
});

describe("shell integration wiring", () => {
  it("tracks cwd from OSC 7 and resolves session readiness", async () => {
    const leaf = freshLeaf();
    const onCwd = vi.fn();
    const utils = await mountLeaf(leaf, { onCwd });
    expect(leafCwd(leaf)).toBeNull();
    emitOsc(7, "file://host/home/me/dir");
    expect(onCwd).toHaveBeenCalledWith("/home/me/dir");
    expect(leafCwd(leaf)).toBe("/home/me/dir");
    await expect(whenSessionReady(leaf, 10)).resolves.toBeUndefined();
    utils.unmount();
    disposeSession(leaf);
  });

  it("keeps the slot while hidden during a foreground command", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    emitOsc(133, "C;npm run dev");
    utils.rerender(<Host leafId={leaf} visible={false} />);
    await flush();
    expect(parkLeafSlot).toHaveBeenCalledWith(leaf);
    expect(releaseSlot).not.toHaveBeenCalled();
    utils.unmount();
    disposeSession(leaf);
  });

  it("releases a hidden leaf's slot shortly after its command finishes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const leaf = freshLeaf();
      const utils = await mountLeaf(leaf);
      emitOsc(133, "C;sleep 1");
      utils.rerender(<Host leafId={leaf} visible={false} />);
      await flush();
      expect(releaseSlot).not.toHaveBeenCalled();
      emitOsc(133, "D;0");
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(releaseSlot).toHaveBeenCalledWith(leaf);
      utils.unmount();
      disposeSession(leaf);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases an idle hidden leaf once the backend confirms no foreground job", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    utils.rerender(<Host leafId={leaf} visible={false} />);
    await flush();
    expect(ptyRuntime.hasForegroundJob).toHaveBeenCalledWith(spawned[0].pty.id);
    expect(releaseSlot).toHaveBeenCalledWith(leaf);
    utils.unmount();
    disposeSession(leaf);
  });

  it("keeps the slot for a hidden leaf running a detected agent", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    agent.active.add(spawned[0].pty.id);
    utils.rerender(<Host leafId={leaf} visible={false} />);
    await flush();
    expect(releaseSlot).not.toHaveBeenCalled();
    utils.unmount();
    disposeSession(leaf);
  });
});

describe("spawn failure handling", () => {
  it("retries the spawn once before surfacing an error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const leaf = freshLeaf();
      openPtyMock
        .mockRejectedValueOnce(new Error("flaky"))
        .mockImplementation(defaultOpenPty as unknown as typeof openPty);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const utils = render(<Host leafId={leaf} visible />);
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      await flush();
      expect(openPtyMock).toHaveBeenCalledTimes(2);
      expect(writeToSession(leaf, "ok")).toBe(true);
      errSpy.mockRestore();
      utils.unmount();
      disposeSession(leaf);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a permanent failure into the pane and lets Enter retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const leaf = freshLeaf();
      openPtyMock.mockRejectedValue(new Error("bad cwd"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const utils = render(<Host leafId={leaf} visible />);
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      await flush();
      // Both attempts failed: writes are refused, error text reached the
      // engine byte-perfectly through the real stream parser.
      expect(writeToSession(leaf, "x")).toBe(false);
      const eng = engineFor(leaf);
      expect(writtenText(eng)).toContain("failed to start shell");

      // Enter through the renderer bridge triggers a respawn, which resets
      // the engine and re-enables stdin.
      eng.reset.mockClear();
      eng.setStdinEnabled.mockClear();
      openPtyMock.mockImplementation(
        defaultOpenPty as unknown as typeof openPty,
      );
      await act(async () => {
        pool.adapter?.resolveLeaf(leaf)?.writeToPty("\r");
        for (let i = 0; i < 8; i++) await Promise.resolve();
      });
      expect(eng.setStdinEnabled).toHaveBeenCalledWith(true);
      expect(eng.reset).toHaveBeenCalled();
      expect(writeToSession(leaf, "recovered")).toBe(true);
      errSpy.mockRestore();
      utils.unmount();
      disposeSession(leaf);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("renderer adapter", () => {
  it("routes bridge writes and resizes to the PTY", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    const bridge = pool.adapter?.resolveLeaf(leaf);
    bridge?.writeToPty("typed");
    expect(spawned[0].pty.write).toHaveBeenCalledWith("typed");
    bridge?.resizePty(132, 43);
    expect(spawned[0].pty.resize).toHaveBeenCalledWith(132, 43);
    // DEC private modes come from the session's stream parser.
    expect(bridge?.getDecModes()?.mouseTracking).toBe("none");
    utils.unmount();
    disposeSession(leaf);
  });

  it("kickPty bumps rows to force a SIGWINCH", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    await act(async () => {
      pool.adapter?.resolveLeaf(leaf)?.kickPty(80, 24);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(spawned[0].pty.resize).toHaveBeenCalledWith(80, 25);
    expect(spawned[0].pty.resize).toHaveBeenCalledWith(80, 24);
    utils.unmount();
    disposeSession(leaf);
  });

  it("stores serialized snapshots and dims on the session", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    pool.adapter?.storeSnapshot(leaf, {
      snapshot: "\x1b[31mline1\x1b[0m\nline2\n\n",
      lines: 3,
      cols: 90,
      rows: 25,
      altScreen: false,
    });
    dropSlot(leaf);
    expect(sessionApi?.getBuffer()).toBe("line1\nline2");
    utils.unmount();
    disposeSession(leaf);
  });

  it("answers visibility, focus and busy queries per leaf", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { focused: true });
    expect(pool.adapter?.isLeafVisible(leaf)).toBe(true);
    expect(pool.adapter?.isLeafFocused(leaf)).toBe(true);
    expect(pool.adapter?.isLeafBusy(leaf)).toBe(false);
    emitOsc(133, "C;cmd");
    expect(pool.adapter?.isLeafBusy(leaf)).toBe(true);
    expect(pool.adapter?.isLeafBlocks(leaf)).toBe(false);
    expect(pool.adapter?.resolveLeaf(999999)).toBeNull();
    utils.unmount();
    disposeSession(leaf);
  });

  it("evictLeaf releases the leaf's slot", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    pool.adapter?.evictLeaf(leaf);
    expect(releaseSlot).toHaveBeenCalledWith(leaf);
    utils.unmount();
    disposeSession(leaf);
  });
});

describe("PTY output routing", () => {
  it("writes passthrough output into the live engine when bound", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    const eng = engineFor(leaf);
    eng.write.mockClear();
    ptyEmits("hi");
    expect(eng.write).toHaveBeenCalledTimes(1);
    expect(dec.decode(eng.write.mock.calls[0][0] as Uint8Array)).toBe("hi");
    utils.unmount();
    disposeSession(leaf);
  });

  it("consumes shell-integration OSCs instead of forwarding them", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    const eng = engineFor(leaf);
    eng.write.mockClear();
    ptyEmits(`before\x1b]133;C;cmd\x07after`);
    expect(writtenText(eng)).toBe("beforeafter");
    utils.unmount();
    disposeSession(leaf);
  });

  it("buffers output in the dormant ring when the slot is gone", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    dropSlot(leaf);
    spawned[0].handlers.onData(new Uint8Array(16));
    const s = terminalDebugStats().sessions.find((x) => x.leafId === leaf);
    expect(s?.ringBytes).toBe(16);
    utils.unmount();
    disposeSession(leaf);
  });
});

describe("block mode", () => {
  it("drives block mode from OSC 133 C/D and notifies subscribers", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    expect(getLeafBlockMode(leaf)).toBe("prompt");
    expect(pool.adapter?.isLeafBlocks(leaf)).toBe(true);
    const listener = vi.fn();
    const unsub = subscribeLeafBlockMode(leaf, listener);
    act(() => {
      emitOsc(133, "C;cmd");
    });
    expect(getLeafBlockMode(leaf)).toBe("running");
    expect(listener).toHaveBeenCalled();
    expect(sessionApi?.blockMode).toBe("running");
    act(() => {
      emitOsc(133, "D;0");
    });
    expect(getLeafBlockMode(leaf)).toBe("prompt");
    unsub();
    utils.unmount();
    disposeSession(leaf);
  });

  it("disables grid stdin at the prompt and enables plus focuses it while running", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    const eng = engineFor(leaf);
    expect(eng.setStdinEnabled).toHaveBeenLastCalledWith(false);
    act(() => {
      emitOsc(133, "C;cmd");
    });
    expect(eng.setStdinEnabled).toHaveBeenLastCalledWith(true);
    expect(eng.focus).toHaveBeenCalled();
    utils.unmount();
    disposeSession(leaf);
  });

  it("tracks cwd from OSC 7 on a blocks session", async () => {
    const leaf = freshLeaf();
    const onCwd = vi.fn();
    const utils = await mountLeaf(leaf, { blocks: true, onCwd });
    emitOsc(7, "file://host/block/cwd");
    expect(onCwd).toHaveBeenCalledWith("/block/cwd");
    expect(leafCwd(leaf)).toBe("/block/cwd");
    utils.unmount();
    disposeSession(leaf);
  });

  it("returns getLeafBlockMode prompt and a noop unsubscribe for unknown leaves", () => {
    expect(getLeafBlockMode(424242)).toBe("prompt");
    expect(() => subscribeLeafBlockMode(424242, () => {})()).not.toThrow();
  });
});

describe("watermark gating", () => {
  it("is dead for unknown leaves", () => {
    expect(blockWatermarkState(313131)).toBe("dead");
  });

  it("is visible on a pristine block terminal", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    expect(blockWatermarkState(leaf)).toBe("visible");
    utils.unmount();
    disposeSession(leaf);
  });

  it("hides while the input has text", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    setLeafInputActivity(leaf, true);
    expect(blockWatermarkState(leaf)).toBe("hidden");
    setLeafInputActivity(leaf, false);
    expect(blockWatermarkState(leaf)).toBe("visible");
    utils.unmount();
    disposeSession(leaf);
  });

  it("dies permanently once a command was submitted", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    submitToLeaf(leaf, "echo hi");
    expect(blockWatermarkState(leaf)).toBe("dead");
    utils.unmount();
    disposeSession(leaf);
  });

  it("dies when the viewport shows any glyphs", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    engineFor(leaf).viewportHasGlyphs.mockReturnValue(true);
    expect(blockWatermarkState(leaf)).toBe("dead");
    utils.unmount();
    disposeSession(leaf);
  });

  it("dies once scrollback exists", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    engineFor(leaf).scrollbackCount.mockReturnValue(3);
    expect(blockWatermarkState(leaf)).toBe("dead");
    utils.unmount();
    disposeSession(leaf);
  });

  it("hides when the slot is not bound", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    pool.adapter?.evictLeaf(leaf);
    expect(blockWatermarkState(leaf)).toBe("hidden");
    utils.unmount();
    disposeSession(leaf);
  });
});

describe("module-level queries", () => {
  it("maps a pty id back to its leaf", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    expect(leafIdForPty(spawned[0].pty.id)).toBe(leaf);
    expect(leafIdForPty(-1)).toBeNull();
    utils.unmount();
    disposeSession(leaf);
  });

  it("clears the focused visible terminal only", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { focused: true });
    expect(clearFocusedTerminal()).toBe(true);
    expect(engineFor(leaf).clear).toHaveBeenCalled();
    utils.rerender(<Host leafId={leaf} visible={false} focused={false} />);
    await flush();
    expect(clearFocusedTerminal()).toBe(false);
    utils.unmount();
    disposeSession(leaf);
  });

  it("block queries answer through live decorations for blocks sessions", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true, focused: true });
    // Decorations exist (navigation is accepted) but no blocks ran yet,
    // so every query returns its empty default.
    expect(navigateFocusedBlocks(1)).toBe(true);
    expect(sessionApi?.visibleBlocks()).toEqual({ blocks: [], sticky: null });
    expect(sessionApi?.readBlockId("b1")).toBeNull();
    expect(sessionApi?.searchBlock("b1", "q")).toEqual([]);
    utils.unmount();
    disposeSession(leaf);
    expect(navigateFocusedBlocks(1)).toBe(false);
  });

  it("returns the grid selection or null", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    expect(leafGridSelection(leaf)).toBeNull();
    vi.mocked(engineSelectionText).mockReturnValueOnce("copied");
    expect(leafGridSelection(leaf)).toBe("copied");
    utils.unmount();
    disposeSession(leaf);
  });

  it("stores and recalls per-leaf input drafts", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    expect(getLeafDraft(leaf)).toBe("");
    setLeafDraft(leaf, "half typed");
    expect(getLeafDraft(leaf)).toBe("half typed");
    expect(getLeafDraft(515151)).toBe("");
    utils.unmount();
    disposeSession(leaf);
  });

  it("retains a footer focus callback registered before the session mounts", async () => {
    const leaf = freshLeaf();
    const focus = vi.fn();
    setLeafInputFocus(leaf, focus);
    const utils = await mountLeaf(leaf, { blocks: true });
    await vi.waitFor(() => expect(focus).toHaveBeenCalled());
    const mountFocusCalls = focus.mock.calls.length;
    focusLeafInput(leaf);
    expect(focus).toHaveBeenCalledTimes(mountFocusCalls + 1);
    setLeafInputFocus(leaf, null);
    focusLeafInput(leaf);
    expect(focus).toHaveBeenCalledTimes(mountFocusCalls + 1);
    utils.unmount();
    disposeSession(leaf);
  });

  it("focuses a block footer registered after its prompt session mounts", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf, { blocks: true });
    const focus = vi.fn();
    setLeafInputFocus(leaf, focus);
    await vi.waitFor(() => expect(focus).toHaveBeenCalled());
    setLeafInputFocus(leaf, null);
    utils.unmount();
    disposeSession(leaf);
  });

  it("asks the backend about foreground processes", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    ptyRuntime.hasForegroundProcess.mockResolvedValueOnce(true);
    await expect(leafHasForegroundProcess(leaf)).resolves.toBe(true);
    await expect(leafHasForegroundProcess(717171)).resolves.toBe(false);
    utils.unmount();
    disposeSession(leaf);
  });

  it("reads the live buffer through the session handle", async () => {
    const leaf = freshLeaf();
    const utils = await mountLeaf(leaf);
    engineFor(leaf).getBufferTail.mockReturnValue("$ echo hi\nhi");
    expect(sessionApi?.getBuffer()).toBe("$ echo hi\nhi");
    expect(engineFor(leaf).getBufferTail).toHaveBeenCalledWith(200);
    utils.unmount();
    disposeSession(leaf);
  });
});
