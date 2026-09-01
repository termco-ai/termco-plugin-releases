/**
 * Cell-metrics measurement and grid-size math — the FitAddon
 * replacement. wterm's own autoResize is disabled by the pool (it
 * would fire on slot parking and recycler moves), so the pool measures
 * and drives `resize()` itself through these helpers.
 */

export type CellMetrics = { width: number; height: number };

const PROBE_GLYPHS = 32;

/**
 * Measure one cell by probing a hidden row inside the wterm element so
 * the probe inherits its computed font. Returns null when the element
 * isn't laid out yet (display:none host).
 */
export function measureCellMetrics(wtermEl: HTMLElement): CellMetrics | null {
  const row = document.createElement("div");
  row.className = "term-row";
  row.style.position = "absolute";
  row.style.visibility = "hidden";
  const span = document.createElement("span");
  span.textContent = "0".repeat(PROBE_GLYPHS);
  row.appendChild(span);
  wtermEl.appendChild(row);
  const width = span.getBoundingClientRect().width / PROBE_GLYPHS;
  const height = row.getBoundingClientRect().height;
  row.remove();
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Grid dimensions fitting a content box, with sane minimums. */
export function computeGrid(
  contentWidth: number,
  contentHeight: number,
  cell: CellMetrics,
): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor(contentWidth / cell.width)),
    rows: Math.max(1, Math.floor(contentHeight / cell.height)),
  };
}
