/**
 * wterm terminal search — the engine-side implementation of
 * {@link TerminalSearchHandle} that replaces xterm's SearchAddon.
 *
 * `createTerminalSearch(getEngine)` binds lazily to whatever engine the
 * getter returns at call time (renderer-pool leaves rebind engines), so
 * a null or not-yet-ready engine is a silent no-op, never a throw.
 *
 * Flow per find call: scan the buffer (cached until the query changes
 * or `refresh` re-runs it), advance the active match with wrap-around,
 * scroll it to the vertical center (row-aligned; the engine clamps),
 * paint immediately, then repaint on a double rAF — the fixed-screen
 * renderer repaints rows asynchronously after a scroll assignment, so
 * the immediate paint targets the pre-scroll frame and the rAF pass
 * targets the settled one.
 *
 * Nothing subscribes to engine output here; repaint-on-live-output
 * polish is deliberately left to the caller (future work).
 */
import type { TerminalEngine } from "../engine";
import type {
  TerminalSearchHandle,
  TerminalSearchOptions,
} from "../search/types";
import { type SearchMatch, scanBuffer } from "./engine";
import {
  createHighlightPainter,
  type HighlightPainter,
  type HighlightView,
} from "./highlights";

/**
 * The slice of {@link TerminalEngine} search needs. Structural so tests
 * can fake it; a real `() => TerminalEngine | null` getter satisfies it.
 */
export type SearchableEngine = Pick<
  TerminalEngine,
  "element" | "core" | "scrollTop" | "viewportHeight" | "lineToPx"
>;

const FALLBACK_ROW_HEIGHT_PX = 17;

/** wterm publishes its measured row height as an inline CSS variable. */
function rowHeightOf(el: HTMLElement): number {
  const raw =
    el.style.getPropertyValue("--term-row-height") ||
    getComputedStyle(el).getPropertyValue("--term-row-height");
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) && px > 0 ? px : FALLBACK_ROW_HEIGHT_PX;
}

export function createTerminalSearch(
  getEngine: () => SearchableEngine | null,
): TerminalSearchHandle & { dispose(): void } {
  let query = "";
  let caseSensitive = false;
  let matches: SearchMatch[] = [];
  let activeIndex = -1;

  // One painter per engine root element; leaves swap engines on rebind.
  let painterEntry: { el: HTMLElement; painter: HighlightPainter } | null =
    null;
  let rafOuter = 0;
  let rafInner = 0;

  const painterFor = (el: HTMLElement): HighlightPainter => {
    if (painterEntry && painterEntry.el === el) return painterEntry.painter;
    painterEntry?.painter.clear();
    painterEntry = { el, painter: createHighlightPainter(el) };
    return painterEntry.painter;
  };

  const cancelScheduled = (): void => {
    if (typeof cancelAnimationFrame !== "function") return;
    if (rafOuter) cancelAnimationFrame(rafOuter);
    if (rafInner) cancelAnimationFrame(rafInner);
    rafOuter = 0;
    rafInner = 0;
  };

  const paintNow = (engine: SearchableEngine): void => {
    const painter = painterFor(engine.element);
    if (matches.length === 0) {
      painter.clear();
      return;
    }
    const rh = rowHeightOf(engine.element);
    let view: HighlightView;
    if (engine.element.classList.contains("blocks-mode")) {
      // Blocks mode: rows live inside per-command containers and carry
      // their buffer line as data-line (lines hidden by widgets/collapse
      // have no row element and are skipped).
      const byLine = new Map<number, HTMLElement>();
      let first = Number.POSITIVE_INFINITY;
      let last = -1;
      for (const el of engine.element.querySelectorAll<HTMLElement>(
        ".term-row[data-line]",
      )) {
        const line = Number(el.dataset.line);
        if (!Number.isFinite(line)) continue;
        byLine.set(line, el);
        if (line < first) first = line;
        if (line > last) last = line;
      }
      view = {
        firstVisibleLine: Number.isFinite(first) ? first : 0,
        lastVisibleLine: last,
        rowHeightPx: rh,
        rowElAt: (bufferLine) => byLine.get(bufferLine) ?? null,
      };
    } else {
      const first = Math.floor(engine.scrollTop / rh);
      const rowEls = Array.from(
        engine.element.querySelectorAll<HTMLElement>(".term-row"),
      );
      // The fixed-screen renderer keeps rows+1 row divs, div i showing
      // buffer line first+i; fall back to a viewport estimate pre-render.
      const visibleCount =
        rowEls.length > 0
          ? rowEls.length
          : Math.max(1, Math.ceil(engine.viewportHeight / rh) + 1);
      view = {
        firstVisibleLine: first,
        lastVisibleLine: first + visibleCount - 1,
        rowHeightPx: rh,
        rowElAt(bufferLine) {
          const i = bufferLine - first;
          return i >= 0 && i < rowEls.length ? rowEls[i] : null;
        },
      };
    }
    painter.paint(matches, activeIndex, view);
  };

  /** Repaint after the renderer has processed the scroll (async rows). */
  const schedulePaint = (): void => {
    cancelScheduled();
    if (typeof requestAnimationFrame !== "function") return;
    rafOuter = requestAnimationFrame(() => {
      rafOuter = 0;
      rafInner = requestAnimationFrame(() => {
        rafInner = 0;
        const engine = getEngine();
        if (engine?.core()) paintNow(engine);
      });
    });
  };

  /** First match at or below `bufferLine`, wrapping to the top match. */
  const indexAtOrAfter = (bufferLine: number): number => {
    const i = matches.findIndex((m) => m.bufferLine >= bufferLine);
    return i === -1 ? 0 : i;
  };

  /**
   * Center the match vertically, row-aligned so overlays stay crisp.
   * lineToPx is blocks-layout aware (block headers/gaps offset lines
   * from the uniform line × rowHeight grid); flat mode degrades to
   * exactly the old `line × rowHeight` math.
   */
  const reveal = (engine: SearchableEngine, match: SearchMatch): void => {
    const rh = rowHeightOf(engine.element);
    const viewportRows = Math.max(1, Math.floor(engine.viewportHeight / rh));
    const centerOffset = (viewportRows >> 1) * rh;
    engine.scrollTop = Math.max(
      0,
      engine.lineToPx(match.bufferLine) - centerOffset,
    ); // engine clamps to the scroll range
  };

  const resetState = (): void => {
    query = "";
    caseSensitive = false;
    matches = [];
    activeIndex = -1;
  };

  const find = (
    direction: 1 | -1,
    nextQuery: string,
    options?: TerminalSearchOptions,
  ): boolean => {
    const engine = getEngine();
    const core = engine?.core() ?? null;
    if (!engine || !core) return false;
    if (!nextQuery) {
      clearDecorations();
      return false;
    }
    const nextCase = options?.caseSensitive ?? false;
    const changed = nextQuery !== query || nextCase !== caseSensitive;
    const prevActive = activeIndex >= 0 ? matches[activeIndex] : null;
    if (changed) {
      query = nextQuery;
      caseSensitive = nextCase;
      matches = scanBuffer(core, query, { caseSensitive });
      activeIndex = -1;
    }
    if (matches.length === 0) {
      activeIndex = -1;
      painterFor(engine.element).clear();
      return false;
    }
    const rh = rowHeightOf(engine.element);
    const firstVisible = Math.floor(engine.scrollTop / rh);
    if (options?.incremental) {
      // Live typing: stay on the same spot while it still matches
      // there, otherwise restart from the top of the viewport.
      const kept = prevActive
        ? matches.findIndex(
            (m) =>
              m.bufferLine === prevActive.bufferLine &&
              m.col === prevActive.col,
          )
        : -1;
      activeIndex = kept >= 0 ? kept : indexAtOrAfter(firstVisible);
    } else if (activeIndex === -1) {
      // Fresh query (or post-clear): anchor to the viewport, and for a
      // backwards search take the match just above that anchor.
      const start = indexAtOrAfter(firstVisible);
      activeIndex =
        direction === 1 ? start : (start - 1 + matches.length) % matches.length;
    } else {
      activeIndex = (activeIndex + direction + matches.length) % matches.length;
    }
    reveal(engine, matches[activeIndex]);
    paintNow(engine);
    schedulePaint();
    return true;
  };

  const clearDecorations = (): void => {
    cancelScheduled();
    resetState();
    painterEntry?.painter.clear();
  };

  return {
    findNext: (q, options) => find(1, q, options),
    findPrevious: (q, options) => find(-1, q, options),
    clearDecorations,
    /** Re-run the query in place (e.g. after a buffer restore). */
    refresh(nextQuery: string): void {
      if (!nextQuery) {
        clearDecorations();
        return;
      }
      const engine = getEngine();
      const core = engine?.core() ?? null;
      if (!engine || !core) return;
      const prevActive = activeIndex >= 0 ? matches[activeIndex] : null;
      query = nextQuery;
      matches = scanBuffer(core, query, { caseSensitive });
      activeIndex = prevActive
        ? matches.findIndex(
            (m) =>
              m.bufferLine === prevActive.bufferLine &&
              m.col === prevActive.col,
          )
        : -1;
      paintNow(engine);
    },
    dispose(): void {
      cancelScheduled();
      painterEntry?.painter.clear();
      painterEntry = null;
      resetState();
    },
  };
}
