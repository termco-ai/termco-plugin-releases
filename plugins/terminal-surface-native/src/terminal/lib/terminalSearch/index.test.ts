// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import type { CellData, TerminalCore } from "@wterm/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTerminalSearch, type SearchableEngine } from "./index";

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/** Fake core over live string arrays (mutate them to change the buffer). */
function fakeCore(
  scrollback: string[],
  grid: string[],
  cols = 40,
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
    getCols: () => cols,
    getRows: () => grid.length,
    getCursor: () => ({ row: 0, col: 0, visible: true }),
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

type FakeEngine = SearchableEngine & { element: HTMLElement };

/**
 * Fake engine: a host with grid.length+1 `.term-row` divs (the fixed
 * screen), --term-row-height: 10px, and a plain scrollTop property.
 */
function fakeEngine(
  scrollback: string[],
  grid: string[],
  viewportHeight = grid.length * 10,
): FakeEngine {
  const element = document.createElement("div");
  element.style.setProperty("--term-row-height", "10px");
  for (let i = 0; i < grid.length + 1; i++) {
    const row = document.createElement("div");
    row.className = "term-row";
    const span = document.createElement("span");
    span.textContent = "........................................";
    row.appendChild(span);
    element.appendChild(row);
  }
  document.body.appendChild(element);
  const core = fakeCore(scrollback, grid);
  return {
    element,
    core: () => core,
    scrollTop: 0,
    viewportHeight,
    // Flat mapping (row height from the CSS var, 17px fallback like
    // production) — the real engine is blocks-layout aware.
    lineToPx: (line: number) =>
      line *
      (Number.parseFloat(element.style.getPropertyValue("--term-row-height")) ||
        17),
  };
}

const overlayDivs = (el: HTMLElement): HTMLElement[] =>
  Array.from(el.querySelectorAll<HTMLElement>(".term-search-overlay > div"));

const activeDiv = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>(".term-search-overlay > div.active");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createTerminalSearch", () => {
  // Matches for "foo": line 0 col 6, line 2 col 0, line 5 col 6.
  const setup = () => {
    const engine = fakeEngine(
      ["alpha foo", "bar", "foo baz", "", "x"],
      ["hello foo", "world", "", ""],
      40, // 4 visible rows at 10px
    );
    const search = createTerminalSearch(() => engine);
    return { engine, search };
  };

  it("is safe with a null engine", () => {
    const search = createTerminalSearch(() => null);
    expect(search.findNext("foo")).toBe(false);
    expect(search.findPrevious("foo")).toBe(false);
    expect(() => search.clearDecorations()).not.toThrow();
    expect(() => search.refresh?.("foo")).not.toThrow();
    expect(() => search.dispose()).not.toThrow();
  });

  it("is safe with an engine whose core is not ready", () => {
    const engine = { ...fakeEngine([], ["x"]), core: () => null };
    const search = createTerminalSearch(() => engine);
    expect(search.findNext("x")).toBe(false);
  });

  it("returns false and clears on an empty query", () => {
    const { engine, search } = setup();
    expect(search.findNext("foo")).toBe(true);
    expect(overlayDivs(engine.element).length).toBeGreaterThan(0);
    expect(search.findNext("")).toBe(false);
    expect(overlayDivs(engine.element)).toHaveLength(0);
  });

  it("returns false when nothing matches", () => {
    const { search } = setup();
    expect(search.findNext("zebra")).toBe(false);
  });

  it("cycles forward through matches and wraps around", () => {
    const { engine, search } = setup();

    // 1st: anchors to the viewport top → line 0 (centering clamps to 0).
    expect(search.findNext("foo")).toBe(true);
    expect(engine.scrollTop).toBe(0);
    expect(activeDiv(engine.element)?.style.top).toBe("0px");
    expect(activeDiv(engine.element)?.style.left).toBe("6ch");

    // 2nd: line 2, still centered near the top.
    search.findNext("foo");
    expect(engine.scrollTop).toBe(0);
    expect(activeDiv(engine.element)?.style.top).toBe("20px");
    expect(activeDiv(engine.element)?.style.left).toBe("0ch");

    // 3rd: line 5 → centered: top line 3 → scrollTop 30.
    search.findNext("foo");
    expect(engine.scrollTop).toBe(30);
    expect(activeDiv(engine.element)?.style.top).toBe("20px"); // (5-3)*10

    // 4th: wraps back to line 0.
    search.findNext("foo");
    expect(engine.scrollTop).toBe(0);
    expect(activeDiv(engine.element)?.style.left).toBe("6ch");
  });

  it("centers the match vertically (row-aligned)", () => {
    const { engine, search } = setup();
    search.findNext("foo");
    search.findNext("foo");
    search.findNext("foo"); // line 5, viewport 4 rows → top line 5-2=3
    expect(engine.scrollTop).toBe(3 * 10);
  });

  it("findPrevious from fresh starts above the viewport anchor and cycles back", () => {
    const { engine, search } = setup();
    // Fresh backwards search from the top wraps to the last match (line 5).
    expect(search.findPrevious("foo")).toBe(true);
    expect(engine.scrollTop).toBe(30);
    search.findPrevious("foo"); // line 2
    expect(engine.scrollTop).toBe(0);
    expect(activeDiv(engine.element)?.style.top).toBe("20px");
  });

  it("paints only the matches inside the viewport", () => {
    const { engine, search } = setup();
    search.findNext("foo"); // scrollTop 0, 5 row divs → lines 0..4 visible
    expect(overlayDivs(engine.element)).toHaveLength(2); // lines 0 and 2
    search.findNext("foo");
    search.findNext("foo"); // line 5 → scrollTop 30 → lines 3..7 visible
    expect(overlayDivs(engine.element)).toHaveLength(1);
  });

  it("incremental keeps the active match while it still matches", () => {
    const engine = fakeEngine([], ["ab", "foo x", "y", "foo z"], 40);
    const search = createTerminalSearch(() => engine);
    search.findNext("foo", { incremental: true }); // line 1
    search.findNext("foo"); // line 3, scrollTop (3-2)*10 = 10
    expect(engine.scrollTop).toBe(10);
    // Extending the query re-scans but keeps the same (line, col) spot.
    search.findNext("foo ", { incremental: true });
    expect(engine.scrollTop).toBe(10);
    expect(activeDiv(engine.element)?.style.top).toBe("20px"); // line 3
    expect(activeDiv(engine.element)?.style.width).toBe("4ch");
  });

  it("incremental restarts from the viewport when the spot stops matching", () => {
    const engine = fakeEngine([], ["foo here", "say foobar", "", ""], 40);
    const search = createTerminalSearch(() => engine);
    search.findNext("foo", { incremental: true }); // line 0 col 0
    expect(activeDiv(engine.element)?.style.top).toBe("0px");
    search.findNext("foob", { incremental: true }); // only line 1 col 4 now
    expect(activeDiv(engine.element)?.style.top).toBe("10px");
    expect(activeDiv(engine.element)?.style.left).toBe("4ch");
  });

  it("clearDecorations empties the overlay and resets the cycle", () => {
    const { engine, search } = setup();
    search.findNext("foo");
    search.findNext("foo");
    search.clearDecorations();
    expect(overlayDivs(engine.element)).toHaveLength(0);
    // Next find restarts from the viewport, not the old position.
    engine.scrollTop = 0;
    search.findNext("foo");
    expect(activeDiv(engine.element)?.style.top).toBe("0px");
  });

  it("honors caseSensitive and re-scans when it changes", () => {
    const engine = fakeEngine([], ["FOO", "foo", "", ""], 40);
    const search = createTerminalSearch(() => engine);
    search.findNext("foo");
    expect(overlayDivs(engine.element)).toHaveLength(2);
    search.findNext("foo", { caseSensitive: true });
    expect(overlayDivs(engine.element)).toHaveLength(1);
    expect(activeDiv(engine.element)?.style.top).toBe("10px");
  });

  it("refresh re-scans the (mutated) buffer without scrolling", () => {
    const grid = ["foo", "", "", ""];
    const engine = fakeEngine([], grid, 40);
    const search = createTerminalSearch(() => engine);
    search.findNext("foo");
    expect(overlayDivs(engine.element)).toHaveLength(1);
    grid[2] = "more foo";
    search.refresh?.("foo");
    expect(overlayDivs(engine.element)).toHaveLength(2);
    // The previous active spot survives the re-scan.
    expect(activeDiv(engine.element)?.style.top).toBe("0px");
    expect(engine.scrollTop).toBe(0);
  });

  it("falls back to 17px rows without the CSS variable", () => {
    const engine = fakeEngine([], ["", "", "", "", "", "foo"], 34);
    engine.element.style.removeProperty("--term-row-height");
    const search = createTerminalSearch(() => engine);
    search.findNext("foo"); // line 5, 2 visible rows → top line 4
    expect(engine.scrollTop).toBe(4 * 17);
  });

  it("dispose clears paint state", () => {
    const { engine, search } = setup();
    search.findNext("foo");
    search.dispose();
    expect(
      engine.element.querySelectorAll(".term-search-overlay"),
    ).toHaveLength(0);
  });
});
