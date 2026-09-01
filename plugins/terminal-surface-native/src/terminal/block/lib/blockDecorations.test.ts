// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
/**
 * BlockDecorations over the wterm engine: OSC 133 / OSC 7 markers are driven
 * as real escape bytes through the real PtyStreamParser (the sink counts
 * newline bytes so `currentBufferLine` behaves like a cursor sitting after
 * everything written), block boundaries live as real TerminalLineSpace
 * anchors, and geometry comes from a fake TerminalEngine over a scripted
 * TerminalCore.
 */
import type { CellData, TerminalCore } from "@wterm/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalEngine } from "../../lib/engine";
import { TerminalLineSpace } from "../../lib/lineSpace";
import {
  type ParserSink,
  PtyStreamParser,
} from "../../lib/streamParser";
import {
  BlockDecorations,
  type BlockDecorationsOptions,
} from "./blockDecorations";

const enc = new TextEncoder();
// No --term-row-height CSS var is resolvable in jsdom, so BlockDecorations
// falls back to its default row height.
const RH = 17;

// rAF drives viewport scheduling, revealMatch's overlay placement and
// navigateBlocks' deferred selection. Queue callbacks and drain them with
// flushRaf() so scheduling flags are set before the callbacks run (a
// synchronous stub would fire the callback before `viewportRaf` is assigned,
// wedging the schedule guard).
let rafQueue: FrameRequestCallback[] = [];
function flushRaf(): void {
  while (rafQueue.length > 0) {
    const cbs = rafQueue;
    rafQueue = [];
    for (const cb of cbs) cb(0);
  }
}
beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    rafQueue.push(cb),
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

function makeHarness(opts?: BlockDecorationsOptions) {
  const parser = new PtyStreamParser();
  const lineSpace = new TerminalLineSpace();
  let lines = 0;
  const sink: ParserSink = {
    write(chunk) {
      for (const b of chunk) if (b === 0x0a) lines++;
    },
    respond() {},
    currentBufferLine: () => lines,
    cursorPosition: () => ({ row: 0, col: 0 }),
  };
  const deco = new BlockDecorations({ parser, lineSpace }, opts);
  const push = (s: string) => parser.push(enc.encode(s), sink);
  return { parser, lineSpace, deco, push };
}

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/**
 * Fake core over an array of scrollback strings (oldest first) and grid
 * strings — same shape as the engine test suite's fakeCore.
 */
function fakeCore(
  scrollback: string[],
  grid: string[],
  cursorRow = 0,
): TerminalCore {
  const cellsOf = (s: string): CellData[] =>
    [...s].map((ch) => ({ ...BLANK, char: ch.codePointAt(0) ?? 32 }));
  return {
    init() {},
    resize() {},
    writeString() {},
    writeRaw() {},
    getCell(row, col) {
      const line = grid[row] ?? "";
      return cellsOf(line)[col] ?? BLANK;
    },
    isDirtyRow: () => false,
    clearDirty() {},
    getCols: () => 80,
    getRows: () => grid.length,
    getCursor: () => ({ row: cursorRow, col: 0, visible: true }),
    cursorKeysApp: () => false,
    bracketedPaste: () => false,
    usingAltScreen: () => false,
    getTitle: () => null,
    getResponse: () => null,
    getScrollbackCount: () => scrollback.length,
    getScrollbackCell(offset, col) {
      const line = scrollback[scrollback.length - 1 - offset] ?? "";
      return cellsOf(line)[col] ?? BLANK;
    },
    getScrollbackLineLen(offset) {
      return (scrollback[scrollback.length - 1 - offset] ?? "").length;
    },
    getUnhandledSequences: () => [],
  };
}

function blankLines(n: number): string[] {
  return Array.from({ length: n }, () => "");
}

type FakeEngineOpts = {
  scrollback?: string[];
  grid?: string[];
  /** Viewport rows (engine.rows), independent of the core grid height. */
  rows?: number;
  cursorRow?: number;
  /** Number of .term-row children to materialize for selection tests. */
  termRowEls?: number;
};

function makeFakeEngine(o: FakeEngineOpts = {}) {
  const core = fakeCore(
    o.scrollback ?? [],
    o.grid ?? blankLines(10),
    o.cursorRow ?? 0,
  );
  const element = document.createElement("div");
  for (let i = 0; i < (o.termRowEls ?? 0); i++) {
    const row = document.createElement("div");
    row.className = "term-row";
    element.appendChild(row);
  }
  document.body.appendChild(element);
  let scrollTop = 0;
  let alt = false;
  const engine = {
    element,
    rows: o.rows ?? 10,
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      scrollTop = v;
    },
    core: () => core,
    usingAltScreen: () => alt,
    cellMetrics: () => ({ width: 8, height: RH }),
    // Flat mapping — the real engine is blocks-layout aware.
    lineToPx: (line: number) => line * RH,
  };
  return {
    engine: engine as unknown as TerminalEngine,
    element,
    setAlt(v: boolean) {
      alt = v;
    },
    scrollTo(px: number) {
      scrollTop = px;
    },
    scrollTopValue: () => scrollTop,
  };
}

/** [startOffset, endOffset] of the native selection over the row divs. */
function selectionOffsets(): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  return [r.startOffset, r.endOffset];
}

describe("BlockDecorations — OSC 133 block lifecycle", () => {
  it("creates a finished block on C..D with command, exit code and range", () => {
    const { deco, push } = makeHarness();
    push("one\ntwo\n"); // cursor now on buffer line 2
    push("\x1b]133;C;ls -al\x07");
    push("a\nb\n"); // line 4
    push("\x1b]133;D;0\x07");
    const blocks = deco.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("ls -al");
    expect(blocks[0].exitCode).toBe(0);
    expect(blocks[0].startLine).toBe(2);
    expect(blocks[0].endLine).toBe(4);
  });

  it("records a non-zero exit code", () => {
    const { deco, push } = makeHarness();
    push("\x1b]133;C;false\x07");
    push("\x1b]133;D;1\x07");
    expect(deco.getBlocks()[0].exitCode).toBe(1);
  });

  it("records a null exit code when D carries none or garbage", () => {
    const { deco, push } = makeHarness();
    push("\x1b]133;C;a\x07");
    push("\x1b]133;D\x07");
    push("\x1b]133;C;b\x07");
    push("\x1b]133;D;zz\x07");
    expect(deco.getBlocks().map((b) => b.exitCode)).toEqual([null, null]);
  });

  it("keeps no finished block while a command is still running", () => {
    const { deco, push } = makeHarness();
    push("\x1b]133;C;sleep 10\x07");
    expect(deco.getBlocks()).toHaveLength(0);
  });

  it("auto-closes a live block when a new C arrives without a D", () => {
    const { deco, push } = makeHarness();
    push("x\n");
    push("\x1b]133;C;first\x07");
    push("y\n");
    push("\x1b]133;C;second\x07");
    const blocks = deco.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("first");
    expect(blocks[0].exitCode).toBeNull();
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks()).toHaveLength(2);
    expect(deco.getBlocks()[1].command).toBe("second");
  });

  it("ignores a D that arrives with no live block", () => {
    const { deco, push } = makeHarness();
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks()).toHaveLength(0);
  });

  it("reports hasAnyBlock for live and finished blocks", () => {
    const { deco, push } = makeHarness();
    expect(deco.hasAnyBlock()).toBe(false);
    push("\x1b]133;C;ls\x07");
    expect(deco.hasAnyBlock()).toBe(true);
    push("\x1b]133;D;0\x07");
    expect(deco.hasAnyBlock()).toBe(true);
  });

  // Bash's shell integration emits its 133;C marker with no command payload
  // (PS0 can't carry the text); the host input bar supplies it instead via
  // notePendingCommand. zsh payloads must keep winning.
  it("labels a bare C marker with the host-submitted pending command", () => {
    const { deco, push } = makeHarness();
    deco.notePendingCommand("ls -la");
    push("\x1b]133;C\x07");
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks()[0].command).toBe("ls -la");
  });

  it("prefers the C marker payload over a pending command", () => {
    const { deco, push } = makeHarness();
    deco.notePendingCommand("typed text");
    push("\x1b]133;C;ls\x07");
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks()[0].command).toBe("ls");
  });

  it("consumes the pending command on block start — never labels a later block", () => {
    const { deco, push } = makeHarness();
    deco.notePendingCommand("ls");
    push("\x1b]133;C;ls\x07"); // payload wins, pending discarded anyway
    push("\x1b]133;D;0\x07");
    push("\x1b]133;C\x07"); // bare C with no fresh submit
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks().map((b) => b.command)).toEqual(["ls", ""]);
  });

  it("sanitizes the pending command: control chars flattened, capped at 256", () => {
    const { deco, push } = makeHarness();
    deco.notePendingCommand(`echo a\n\tb\x07c${"x".repeat(300)}`);
    push("\x1b]133;C\x07");
    push("\x1b]133;D;0\x07");
    const cmd = deco.getBlocks()[0].command;
    expect(cmd.startsWith("echo a b c")).toBe(true);
    expect(cmd).not.toMatch(/[\n\t\x07]/);
    expect(cmd).toHaveLength(256);
  });

  it("caps history at MAX_BLOCKS, dropping the oldest", () => {
    const { deco, push } = makeHarness();
    for (let i = 0; i < 1005; i++) {
      push(`\x1b]133;C;cmd${i}\x07\x1b]133;D;0\x07`);
    }
    const blocks = deco.getBlocks();
    expect(blocks).toHaveLength(1000);
    expect(blocks[0].command).toBe("cmd5");
    expect(blocks[blocks.length - 1].command).toBe("cmd1004");
  });
});

describe("BlockDecorations — anchors and ranges", () => {
  function oneBlock() {
    const h = makeHarness();
    h.push("a\nb\n"); // line 2
    h.push("\x1b]133;C;ls\x07");
    h.push("o\n"); // line 3
    h.push("\x1b]133;D;0\x07");
    return h;
  }

  it("shifts block ranges when scrollback is trimmed", () => {
    const { deco, lineSpace } = oneBlock();
    expect(deco.getBlocks()[0]).toMatchObject({ startLine: 2, endLine: 3 });
    lineSpace.notifyTrim(1);
    expect(deco.getBlocks()[0]).toMatchObject({ startLine: 1, endLine: 2 });
  });

  it("drops blocks whose anchors were trimmed away", () => {
    const { deco, lineSpace } = oneBlock();
    lineSpace.notifyTrim(3); // start anchor (abs 2) evicted
    expect(deco.getBlocks()).toHaveLength(0);
    expect(deco.commandLines()).toEqual([]);
  });

  it("blockAt returns the containing block and null outside", () => {
    const { deco } = oneBlock();
    expect(deco.blockAt(2)?.command).toBe("ls");
    expect(deco.blockAt(3)?.command).toBe("ls");
    expect(deco.blockAt(1)).toBeNull();
    expect(deco.blockAt(4)).toBeNull();
  });

  it("commandLines lists the start line of each finished block", () => {
    const { deco, push } = makeHarness();
    push("x\n"); // line 1
    push("\x1b]133;C;a\x07");
    push("o1\n"); // line 2
    push("\x1b]133;D;0\x07");
    push("z\n"); // line 3
    push("\x1b]133;C;b\x07");
    push("o2\n"); // line 4
    push("\x1b]133;D;0\x07");
    expect(deco.commandLines()).toEqual([1, 3]);
  });
});

describe("BlockDecorations — cwd tracking (OSC 7)", () => {
  it("reports cwd between commands and stamps it on new blocks", () => {
    const onCwd = vi.fn();
    const { deco, push } = makeHarness({ onCwd });
    push("\x1b]7;file://host/Users/kevin/dev\x07");
    expect(onCwd).toHaveBeenCalledWith("/Users/kevin/dev");
    push("\x1b]133;C;pwd\x07");
    push("\x1b]133;D;0\x07");
    expect(deco.getBlocks()[0].cwd).toBe("/Users/kevin/dev");
  });

  it("ignores OSC 7 while a command is running (untrusted output)", () => {
    const onCwd = vi.fn();
    const { push } = makeHarness({ onCwd });
    push("\x1b]133;C;ssh evil\x07");
    push("\x1b]7;file://evil/tmp/attacker\x07");
    expect(onCwd).not.toHaveBeenCalled();
    push("\x1b]133;D;0\x07");
    push("\x1b]7;file://host/Users/kevin\x07");
    expect(onCwd).toHaveBeenCalledWith("/Users/kevin");

    // B (command typed, not yet run) also gates cwd until A/D.
    push("\x1b]133;B\x07");
    push("\x1b]7;file://evil/tmp/attacker\x07");
    expect(onCwd).toHaveBeenCalledTimes(1);
    push("\x1b]133;A\x07");
    push("\x1b]7;file://host/Users/kevin/two\x07");
    expect(onCwd).toHaveBeenLastCalledWith("/Users/kevin/two");
  });
});

describe("BlockDecorations — mode machine", () => {
  it("emits running on C and prompt on D, deduplicating", () => {
    const onMode = vi.fn();
    const { push } = makeHarness({ onMode });
    push("\x1b]133;A\x07"); // already prompt: no emit
    expect(onMode).not.toHaveBeenCalled();
    push("\x1b]133;C;ls\x07");
    expect(onMode).toHaveBeenLastCalledWith("running");
    push("\x1b]133;D;0\x07");
    expect(onMode).toHaveBeenLastCalledWith("prompt");
    push("\x1b]133;A\x07"); // still prompt: no duplicate
    expect(onMode).toHaveBeenCalledTimes(2);
  });

  it("switches to alt when the attached engine enters the alt screen", () => {
    const onMode = vi.fn();
    const { deco, push } = makeHarness({ onMode });
    const fe = makeFakeEngine();
    deco.attach(fe.engine);
    fe.setAlt(true);
    push("vim"); // afterWrite → syncAlt
    expect(onMode).toHaveBeenLastCalledWith("alt");
    fe.setAlt(false);
    push("bye");
    expect(onMode).toHaveBeenLastCalledWith("prompt");
  });

  it("leaves alt mode when detached (engine geometry gone)", () => {
    const onMode = vi.fn();
    const { deco } = makeHarness({ onMode });
    const fe = makeFakeEngine();
    deco.attach(fe.engine);
    fe.setAlt(true);
    deco.syncAlt();
    expect(onMode).toHaveBeenLastCalledWith("alt");
    deco.detach();
    deco.syncAlt();
    expect(onMode).toHaveBeenLastCalledWith("prompt");
  });
});

describe("BlockDecorations — geometry (visibleBlocks / rulerMarks)", () => {
  function blockAt2to4() {
    const h = makeHarness();
    h.push("a\nb\n"); // line 2
    h.push("\x1b]133;C;ls\x07");
    h.push("o\no\n"); // line 4
    h.push("\x1b]133;D;0\x07");
    return h;
  }

  it("positions visible finished blocks in pixels, trimming the blank tail", () => {
    const { deco } = blockAt2to4();
    // Lines 2..3 hold output; line 4 is the blank next-prompt row the end
    // anchor rides — chrome must hug the content, not the parked cursor.
    const fe = makeFakeEngine({
      rows: 10,
      grid: ["a", "b", "o", "o", "", "", "", "", "", ""],
    });
    deco.attach(fe.engine);
    const vb = deco.visibleBlocks();
    expect(vb.blocks).toHaveLength(1);
    const b = vb.blocks[0];
    expect(b.top).toBe(2 * RH);
    expect(b.bottom).toBe(4 * RH);
    expect(b.headerTop).toBeCloseTo(2 * RH - 1.9 * RH);
    expect(b.ok).toBe(true);
    expect(b.running).toBe(false);
    expect(vb.sticky).toBeNull();
  });

  it("marks the block straddling the viewport top as sticky", () => {
    const { deco } = blockAt2to4();
    const fe = makeFakeEngine({
      scrollback: ["a", "b", "o", "o", "", "", "", "", "", ""],
      rows: 10,
    });
    deco.attach(fe.engine);
    fe.scrollTo(3 * RH); // vpTop = 3, inside the 2..4 block
    const vb = deco.visibleBlocks();
    expect(vb.blocks).toHaveLength(1);
    expect(vb.sticky?.id).toBe(vb.blocks[0].id);
    expect(vb.blocks[0].top).toBe(-RH);
    // Blank line 4 trimmed → block ends at line 3, one row below vpTop.
    expect(vb.blocks[0].bottom).toBe(RH);
  });

  it("includes the live block, ending at the cursor row", () => {
    const { deco, push } = makeHarness();
    push("a\nb\n"); // line 2
    push("\x1b]133;C;top\x07");
    const fe = makeFakeEngine({ rows: 10, cursorRow: 5 });
    deco.attach(fe.engine);
    const vb = deco.visibleBlocks();
    expect(vb.blocks).toHaveLength(1);
    const b = vb.blocks[0];
    expect(b.running).toBe(true);
    expect(b.exitCode).toBeNull();
    expect(b.top).toBe(2 * RH);
    expect(b.bottom).toBe(6 * RH);
  });

  it("returns nothing over the alt screen", () => {
    const { deco } = blockAt2to4();
    const fe = makeFakeEngine({ rows: 10 });
    deco.attach(fe.engine);
    fe.setAlt(true);
    deco.syncAlt();
    expect(deco.visibleBlocks()).toEqual({ blocks: [], sticky: null });
  });

  it("returns nothing while detached", () => {
    const { deco } = blockAt2to4();
    expect(deco.visibleBlocks()).toEqual({ blocks: [], sticky: null });
  });

  it("excludes blocks scrolled out of the viewport", () => {
    const { deco } = blockAt2to4();
    const fe = makeFakeEngine({ scrollback: blankLines(50), rows: 10 });
    deco.attach(fe.engine);
    fe.scrollTo(20 * RH); // vpTop = 20, block ends at 4
    expect(deco.visibleBlocks().blocks).toHaveLength(0);
  });

  it("rulerMarks places blocks as buffer fractions with pass/fail", () => {
    const { deco, push } = makeHarness();
    push("a\n"); // 1
    push("\x1b]133;C;ok\x07");
    push("o\n"); // 2
    push("\x1b]133;D;0\x07");
    push("x\n"); // 3
    push("\x1b]133;C;bad\x07");
    push("y\n"); // 4
    push("\x1b]133;D;1\x07");
    expect(deco.rulerMarks()).toEqual([]); // detached
    const fe = makeFakeEngine({ grid: blankLines(10) }); // total = 10 lines
    deco.attach(fe.engine);
    expect(deco.rulerMarks()).toEqual([
      { frac: 0.2, ok: true },
      { frac: 0.4, ok: false },
    ]);
  });
});

describe("BlockDecorations — readById", () => {
  function harnessWithOutput() {
    const h = makeHarness();
    h.push("$ ls\n"); // line 1
    h.push("\x1b]133;C;ls\x07");
    h.push("a\nb\n"); // line 3
    h.push("\x1b]133;D;0\x07");
    return h;
  }

  it("reads the block's output from the core, trimming trailing blanks", () => {
    const { deco } = harnessWithOutput();
    const fe = makeFakeEngine({ grid: ["$ ls", "a", "b", "", ""] });
    deco.attach(fe.engine);
    const id = deco.getBlocks()[0].id;
    expect(deco.readById(id)).toEqual({
      command: "ls",
      cwd: "",
      exitCode: 0,
      output: "a\nb",
    });
    expect(deco.readById("nope")).toBeNull();
  });

  it("returns empty output while detached", () => {
    const { deco } = harnessWithOutput();
    const id = deco.getBlocks()[0].id;
    expect(deco.readById(id)?.output).toBe("");
  });
});

describe("BlockDecorations — search", () => {
  function harnessWithGrep() {
    const h = makeHarness();
    h.push("$ grep\n"); // line 1
    h.push("\x1b]133;C;grep foo\x07");
    h.push("foo bar FOO\nno hit\nfoo\n"); // lines 2..4
    h.push("\x1b]133;D;0\x07");
    const fe = makeFakeEngine({
      grid: ["$ grep", "foo bar FOO", "no hit", "foo", ""],
    });
    h.deco.attach(fe.engine);
    return { ...h, fe, id: h.deco.getBlocks()[0].id };
  }

  it("finds case-insensitive matches in the command and output", () => {
    const { deco, id } = harnessWithGrep();
    expect(deco.searchBlock(id, "foo")).toEqual([
      // The command echo ("grep foo") is visible card text — searchable.
      { line: 1, col: 5, len: 3, kind: "command" },
      { line: 1, col: 0, len: 3, kind: "output", ordinal: 0 },
      { line: 1, col: 8, len: 3, kind: "output", ordinal: 1 },
      { line: 3, col: 0, len: 3, kind: "output", ordinal: 2 },
    ]);
  });

  it("returns nothing for empty queries, unknown ids, or detached", () => {
    const { deco, id } = harnessWithGrep();
    expect(deco.searchBlock(id, "")).toEqual([]);
    expect(deco.searchBlock("nope", "foo")).toEqual([]);
    deco.detach();
    expect(deco.searchBlock(id, "foo")).toEqual([]);
  });

  it("revealMatch centers the match and places an overlay; clearSearch removes it", () => {
    const { deco } = makeHarness();
    const fe = makeFakeEngine({ scrollback: blankLines(40), rows: 10 });
    deco.attach(fe.engine);
    deco.revealMatch({ line: 30, col: 4, len: 3 });
    // centered: (30 - rows/2) * rowHeight
    expect(fe.scrollTopValue()).toBe(25 * RH);
    flushRaf(); // the overlay lands after the post-scroll repaint frames
    const overlay = fe.element.querySelector<HTMLElement>(".bt-match");
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe(`${5 * RH}px`); // line 30, vpTop 25
    expect(overlay?.style.left).toBe("32px"); // col 4 × cell width 8
    expect(overlay?.style.width).toBe("24px"); // len 3 × cell width 8
    expect(overlay?.style.height).toBe(`${RH}px`);
    deco.clearSearch();
    expect(fe.element.querySelector(".bt-match")).toBeNull();
  });
});

describe("BlockDecorations — selection and navigation", () => {
  // Two finished blocks at buffer lines 2..3 and 4..5, over an engine
  // element with materialized .term-row children.
  function withTwoBlocks() {
    const h = makeHarness();
    h.push("a\nb\n"); // 2
    h.push("\x1b]133;C;first\x07");
    h.push("o\n"); // 3
    h.push("\x1b]133;D;0\x07");
    h.push("c\n"); // 4
    h.push("\x1b]133;C;second\x07");
    h.push("o\n"); // 5
    h.push("\x1b]133;D;0\x07");
    const fe = makeFakeEngine({ rows: 10, termRowEls: 10 });
    h.deco.attach(fe.engine);
    const [b1, b2] = h.deco.getBlocks();
    return { ...h, fe, b1, b2 };
  }

  it("selectBlock selects the block's rows and clearBlockSelection drops it", () => {
    const { deco, b1 } = withTwoBlocks();
    deco.selectBlock(b1.id);
    expect(selectionOffsets()).toEqual([2, 4]);
    expect(deco.clearBlockSelection()).toBe(true);
    expect(selectionOffsets()).toBeNull();
    expect(deco.clearBlockSelection()).toBe(false);
  });

  it("selectBlockAt selects the containing block and toggles off on re-click", () => {
    const { deco } = withTwoBlocks();
    deco.selectBlockAt(2 * RH + 1); // row 2 → first block
    expect(selectionOffsets()).toEqual([2, 4]);
    deco.selectBlockAt(2 * RH + 1); // same block, selected → clears
    expect(selectionOffsets()).toBeNull();
  });

  it("selectBlockAt outside any block clears the selection", () => {
    const { deco, b2 } = withTwoBlocks();
    deco.selectBlock(b2.id);
    expect(selectionOffsets()).toEqual([4, 6]);
    deco.selectBlockAt(8 * RH + 1); // row 8: no block there
    expect(selectionOffsets()).toBeNull();
  });

  it("navigateBlocks starts at the most recent block, steps, and stops at edges", () => {
    const { deco, fe } = withTwoBlocks();
    deco.navigateBlocks(-1);
    flushRaf(); // selection lands on the frame after the scroll
    expect(fe.scrollTopValue()).toBe((4 - 2) * RH);
    expect(selectionOffsets()).toEqual([4, 6]);
    deco.navigateBlocks(-1);
    flushRaf();
    expect(fe.scrollTopValue()).toBe(0);
    expect(selectionOffsets()).toEqual([2, 4]);
    deco.navigateBlocks(-1); // past the first block: unchanged
    flushRaf();
    expect(selectionOffsets()).toEqual([2, 4]);
    deco.navigateBlocks(1);
    flushRaf();
    expect(selectionOffsets()).toEqual([4, 6]);
    deco.navigateBlocks(1); // past the last block: unchanged
    flushRaf();
    expect(selectionOffsets()).toEqual([4, 6]);
  });

  it("navigateBlocks is a no-op with no blocks", () => {
    const { deco } = makeHarness();
    expect(() => deco.navigateBlocks(-1)).not.toThrow();
  });
});

describe("BlockDecorations — attach/detach/dispose", () => {
  it("fires onViewport for engine scroll events while attached", () => {
    const onViewport = vi.fn();
    const { deco } = makeHarness({ onViewport });
    const fe = makeFakeEngine();
    deco.attach(fe.engine);
    flushRaf();
    onViewport.mockClear();
    fe.element.dispatchEvent(new Event("scroll"));
    flushRaf();
    expect(onViewport).toHaveBeenCalled();
    deco.detach();
    onViewport.mockClear();
    fe.element.dispatchEvent(new Event("scroll"));
    flushRaf();
    expect(onViewport).not.toHaveBeenCalled();
  });

  it("dispose drops blocks, disposes anchors and unregisters parser handlers", () => {
    const onCwd = vi.fn();
    const { deco, push, lineSpace } = makeHarness({ onCwd });
    push("\x1b]133;C;ls\x07");
    push("\x1b]133;D;0\x07");
    expect(lineSpace.anchors()).toHaveLength(2);
    deco.dispose();
    expect(lineSpace.anchors()).toHaveLength(0);
    expect(deco.getBlocks()).toHaveLength(0);
    expect(deco.hasAnyBlock()).toBe(false);
    // Handlers are gone: further OSC traffic changes nothing.
    push("\x1b]133;C;late\x07");
    push("\x1b]133;D;0\x07");
    push("\x1b]7;file://host/Users/kevin\x07");
    expect(deco.hasAnyBlock()).toBe(false);
    expect(deco.getBlocks()).toHaveLength(0);
    expect(onCwd).not.toHaveBeenCalled();
  });
});
