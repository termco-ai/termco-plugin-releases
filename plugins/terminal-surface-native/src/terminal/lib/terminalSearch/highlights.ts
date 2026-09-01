/**
 * Highlight painter for terminal search matches. Two strategies:
 *
 * Primary — CSS Custom Highlight API (available in every Chromium
 * webview): matches within the visible row range become DOM Ranges over
 * the row elements' text nodes, registered under the `term-search` /
 * `term-search-active` highlight names and styled from search.css. No
 * extra DOM, survives the renderer's in-place row repaints for the
 * frame they were painted on.
 *
 * Fallback — absolutely-positioned overlay divs inside a dedicated
 * `.term-search-overlay` container appended to the host element. Used
 * when the Highlight API is missing (jsdom tests exercise this path).
 * Horizontal placement prefers the mapped Range's bounding rect; when
 * layout yields nothing (jsdom), it falls back to `ch`-unit positioning,
 * which is exact for a monospace grid without letter-spacing.
 *
 * A match's `col` is a character offset into the line TEXT, so mapping
 * walks the row's text nodes accumulating character counts (a rendered
 * row is a sequence of styled <span>s). Rows rendered from cells with
 * wide-glyph spacer tails may contain one padding space per wide glyph
 * that the trimmed text does not; such highlights can drift by the
 * number of preceding wide glyphs — accepted for now.
 */
import type { SearchMatch } from "./engine";

export type HighlightView = {
  firstVisibleLine: number;
  lastVisibleLine: number;
  /** Row element currently showing this buffer line, if on screen. */
  rowElAt(bufferLine: number): HTMLElement | null;
  /** Height of one terminal row in CSS pixels (overlay fallback only). */
  rowHeightPx: number;
};

export type HighlightPainter = {
  paint(matches: SearchMatch[], activeIndex: number, view: HighlightView): void;
  clear(): void;
};

const HIGHLIGHT_ALL = "term-search";
const HIGHLIGHT_ACTIVE = "term-search-active";

function supportsHighlightApi(): boolean {
  return (
    typeof Highlight !== "undefined" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    CSS.highlights !== undefined
  );
}

/**
 * Map a character span within a row element to (node, offset) pairs by
 * walking its text nodes. Returns null when the row's text is too short
 * (stale row content — skip rather than mispaint).
 */
function charSpanToRange(
  rowEl: HTMLElement,
  col: number,
  length: number,
): Range | null {
  const doc = rowEl.ownerDocument;
  const walker = doc.createTreeWalker(rowEl, NodeFilter.SHOW_TEXT);
  let start: { node: Text; offset: number } | null = null;
  let end: { node: Text; offset: number } | null = null;
  let consumed = 0;
  const endCol = col + length;
  for (
    let node = walker.nextNode() as Text | null;
    node !== null;
    node = walker.nextNode() as Text | null
  ) {
    const len = node.data.length;
    if (!start && col < consumed + len) {
      start = { node, offset: col - consumed };
    }
    if (start && endCol <= consumed + len) {
      end = { node, offset: endCol - consumed };
      break;
    }
    consumed += len;
  }
  if (!start || !end) return null;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function createHighlightApiPainter(): HighlightPainter {
  return {
    paint(matches, activeIndex, view) {
      const all = new Highlight();
      const active = new Highlight();
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (m.bufferLine < view.firstVisibleLine) continue;
        if (m.bufferLine > view.lastVisibleLine) continue;
        const rowEl = view.rowElAt(m.bufferLine);
        if (!rowEl) continue;
        const range = charSpanToRange(rowEl, m.col, m.length);
        if (!range) continue;
        (i === activeIndex ? active : all).add(range);
      }
      CSS.highlights.set(HIGHLIGHT_ALL, all);
      CSS.highlights.set(HIGHLIGHT_ACTIVE, active);
    },
    clear() {
      CSS.highlights.delete(HIGHLIGHT_ALL);
      CSS.highlights.delete(HIGHLIGHT_ACTIVE);
    },
  };
}

function createOverlayPainter(hostEl: HTMLElement): HighlightPainter {
  let container: HTMLElement | null = null;

  const ensureContainer = (): HTMLElement => {
    if (container?.isConnected) return container;
    container = hostEl.ownerDocument.createElement("div");
    container.className = "term-search-overlay";
    hostEl.appendChild(container);
    return container;
  };

  return {
    paint(matches, activeIndex, view) {
      const host = ensureContainer();
      const hostRect = hostEl.getBoundingClientRect();
      const frag = hostEl.ownerDocument.createDocumentFragment();
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (m.bufferLine < view.firstVisibleLine) continue;
        if (m.bufferLine > view.lastVisibleLine) continue;
        const div = hostEl.ownerDocument.createElement("div");
        if (i === activeIndex) div.className = "active";
        div.style.top = `${(m.bufferLine - view.firstVisibleLine) * view.rowHeightPx}px`;
        div.style.height = `${view.rowHeightPx}px`;
        // Prefer real layout via the mapped text's Range rect; when layout
        // is unavailable (jsdom lacks Range.getBoundingClientRect and
        // measures everything as 0) use ch units instead.
        const rowEl = view.rowElAt(m.bufferLine);
        const range = rowEl ? charSpanToRange(rowEl, m.col, m.length) : null;
        const rect =
          range && typeof range.getBoundingClientRect === "function"
            ? range.getBoundingClientRect()
            : undefined;
        if (rect && rect.width > 0) {
          div.style.left = `${rect.left - hostRect.left}px`;
          div.style.width = `${rect.width}px`;
        } else {
          div.style.left = `${m.col}ch`;
          div.style.width = `${m.length}ch`;
        }
        frag.appendChild(div);
      }
      host.replaceChildren(frag);
    },
    clear() {
      container?.remove();
      container = null;
    },
  };
}

/**
 * Create the best available painter for `hostEl` (the engine's wterm
 * root element, which contains the `.term-row` divs).
 */
export function createHighlightPainter(hostEl: HTMLElement): HighlightPainter {
  return supportsHighlightApi()
    ? createHighlightApiPainter()
    : createOverlayPainter(hostEl);
}
