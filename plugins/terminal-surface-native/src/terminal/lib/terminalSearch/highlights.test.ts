// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchMatch } from "./engine";
import { createHighlightPainter, type HighlightView } from "./highlights";

/** Host with `.term-row` divs, each row's text split across spans. */
function makeHost(rows: string[][]): HTMLElement {
  const host = document.createElement("div");
  for (const spans of rows) {
    const row = document.createElement("div");
    row.className = "term-row";
    for (const text of spans) {
      const span = document.createElement("span");
      span.textContent = text;
      row.appendChild(span);
    }
    host.appendChild(row);
  }
  document.body.appendChild(host);
  return host;
}

/** View over `host` showing buffer lines [first, first+rowCount). */
function makeView(
  host: HTMLElement,
  first: number,
  rowHeightPx = 10,
): HighlightView {
  const rows = host.querySelectorAll<HTMLElement>(".term-row");
  return {
    firstVisibleLine: first,
    lastVisibleLine: first + rows.length - 1,
    rowHeightPx,
    rowElAt(bufferLine) {
      const i = bufferLine - first;
      return i >= 0 && i < rows.length ? rows[i] : null;
    },
  };
}

const overlayDivs = (host: HTMLElement): HTMLElement[] =>
  Array.from(host.querySelectorAll<HTMLElement>(".term-search-overlay > div"));

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("overlay fallback painter (no Highlight API)", () => {
  it("creates overlay divs only for matches in the visible range", () => {
    const host = makeHost([
      ["visible one"],
      ["visible two"],
      ["visible three"],
    ]);
    const painter = createHighlightPainter(host);
    const matches: SearchMatch[] = [
      { bufferLine: 1, col: 0, length: 3 }, // above the view
      { bufferLine: 5, col: 2, length: 3 }, // in view (row 0)
      { bufferLine: 7, col: 0, length: 3 }, // in view (row 2)
      { bufferLine: 9, col: 0, length: 3 }, // below the view
    ];
    painter.paint(matches, -1, makeView(host, 5));
    const divs = overlayDivs(host);
    expect(divs).toHaveLength(2);
    expect(divs[0].style.top).toBe("0px");
    expect(divs[1].style.top).toBe("20px");
  });

  it("positions with ch units when layout is unavailable", () => {
    const host = makeHost([["hello foo bar"]]);
    const painter = createHighlightPainter(host);
    painter.paint(
      [{ bufferLine: 0, col: 6, length: 3 }],
      -1,
      makeView(host, 0),
    );
    const [div] = overlayDivs(host);
    expect(div.style.left).toBe("6ch");
    expect(div.style.width).toBe("3ch");
    expect(div.style.height).toBe("10px");
  });

  it("marks the active match and repaints in place", () => {
    const host = makeHost([["foo"], ["foo"]]);
    const painter = createHighlightPainter(host);
    const matches: SearchMatch[] = [
      { bufferLine: 0, col: 0, length: 3 },
      { bufferLine: 1, col: 0, length: 3 },
    ];
    painter.paint(matches, 0, makeView(host, 0));
    let divs = overlayDivs(host);
    expect(divs.map((d) => d.classList.contains("active"))).toEqual([
      true,
      false,
    ]);
    // Repaint with a different active index replaces, not accumulates.
    painter.paint(matches, 1, makeView(host, 0));
    divs = overlayDivs(host);
    expect(divs).toHaveLength(2);
    expect(divs.map((d) => d.classList.contains("active"))).toEqual([
      false,
      true,
    ]);
    expect(host.querySelectorAll(".term-search-overlay")).toHaveLength(1);
  });

  it("clear() removes the whole overlay", () => {
    const host = makeHost([["foo"]]);
    const painter = createHighlightPainter(host);
    painter.paint([{ bufferLine: 0, col: 0, length: 3 }], 0, makeView(host, 0));
    expect(overlayDivs(host)).toHaveLength(1);
    painter.clear();
    expect(host.querySelectorAll(".term-search-overlay")).toHaveLength(0);
    // Clearing twice is safe.
    painter.clear();
  });

  it("still paints rows whose text is shorter than the match column", () => {
    const host = makeHost([["ab"]]); // stale/short row content
    const painter = createHighlightPainter(host);
    painter.paint(
      [{ bufferLine: 0, col: 10, length: 4 }],
      -1,
      makeView(host, 0),
    );
    const [div] = overlayDivs(host);
    expect(div.style.left).toBe("10ch");
  });
});

describe("Highlight API painter", () => {
  class FakeHighlight {
    ranges: Range[] = [];
    add(range: Range): void {
      this.ranges.push(range);
    }
  }

  function stubHighlightApi(): Map<string, FakeHighlight> {
    const registry = new Map<string, FakeHighlight>();
    vi.stubGlobal("Highlight", FakeHighlight);
    vi.stubGlobal("CSS", { highlights: registry });
    return registry;
  }

  it("registers ranges mapped across a row's text nodes", () => {
    const registry = stubHighlightApi();
    const host = makeHost([["hel", "lo w", "orld"]]);
    const painter = createHighlightPainter(host);
    painter.paint(
      [
        { bufferLine: 0, col: 3, length: 4 }, // "lo w", spans two text nodes
        { bufferLine: 0, col: 8, length: 3 }, // "rld"
      ],
      1,
      makeView(host, 0),
    );
    const all = registry.get("term-search");
    const active = registry.get("term-search-active");
    expect(all?.ranges.map(String)).toEqual(["lo w"]);
    expect(active?.ranges.map(String)).toEqual(["rld"]);
    // No overlay DOM on the API path.
    expect(host.querySelectorAll(".term-search-overlay")).toHaveLength(0);
  });

  it("skips off-screen matches and rows too short to map", () => {
    const registry = stubHighlightApi();
    const host = makeHost([["short"]]);
    const painter = createHighlightPainter(host);
    painter.paint(
      [
        { bufferLine: 5, col: 0, length: 2 }, // off-screen
        { bufferLine: 0, col: 10, length: 2 }, // beyond the row text
        { bufferLine: 0, col: 0, length: 2 }, // valid
      ],
      -1,
      makeView(host, 0),
    );
    expect(registry.get("term-search")?.ranges.map(String)).toEqual(["sh"]);
  });

  it("clear() drops both registry entries", () => {
    const registry = stubHighlightApi();
    const host = makeHost([["foo"]]);
    const painter = createHighlightPainter(host);
    painter.paint([{ bufferLine: 0, col: 0, length: 3 }], 0, makeView(host, 0));
    expect(registry.size).toBe(2);
    painter.clear();
    expect(registry.size).toBe(0);
  });
});
