/**
 * Clickable links over visible terminal rows. Injected coordinate, row-text,
 * geometry, and navigation seams keep scrollback mapping in the renderer and
 * make this overlay independently testable.
 */
import { findUrlAt } from "./urlMatch";

;

export type LinkifyDeps = {
  pointToCell(x: number, y: number): { col: number; row: number } | null;
  /** Text of the VISIBLE grid row (row index as returned by pointToCell). */
  rowText(row: number): string;
  /** Cell geometry for overlay placement; null before first layout. */
  metrics(): { cellWidth: number; rowHeight: number } | null;
  openUrl(url: string): Promise<void> | void;
};

export const LINK_OVERLAY_CLASS = "term-link-overlay";

/** A click that travels this far or more is a drag, not a link click. */
const CLICK_SLOP_PX = 4;

type Hover = {
  url: string;
  row: number;
  startCol: number;
  endCol: number;
};

/**
 * Wires pointer handlers onto `host`. Returns a dispose function that
 * removes all listeners and the underline overlay.
 */
export function attachLinkHandlers(
  host: HTMLElement,
  deps: LinkifyDeps,
): () => void {
  let overlay: HTMLDivElement | null = null;
  let rafId = 0;
  let lastX = 0;
  let lastY = 0;
  let downX = Number.NaN;
  let downY = Number.NaN;

  // The overlay needs a positioned ancestor; take over host if static.
  const prevInlinePosition = host.style.position;
  const computedPosition = getComputedStyle(host).position;
  const tookOverPosition =
    computedPosition === "" || computedPosition === "static";
  if (tookOverPosition) host.style.position = "relative";

  const hitAt = (x: number, y: number): Hover | null => {
    const cell = deps.pointToCell(x, y);
    if (!cell) return null;
    const hit = findUrlAt(deps.rowText(cell.row), cell.col);
    return hit ? { ...hit, row: cell.row } : null;
  };

  const clearHover = (): void => {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    host.style.cursor = "";
  };

  const showHover = (hit: Hover): void => {
    const m = deps.metrics();
    if (!m) {
      clearHover();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = LINK_OVERLAY_CLASS;
      const s = overlay.style;
      s.position = "absolute";
      s.pointerEvents = "none";
      s.borderBottom = "1px solid currentColor";
      host.appendChild(overlay);
    }
    overlay.style.left = `${hit.startCol * m.cellWidth}px`;
    overlay.style.top = `${hit.row * m.rowHeight}px`;
    overlay.style.width = `${(hit.endCol - hit.startCol) * m.cellWidth}px`;
    overlay.style.height = `${m.rowHeight}px`;
    host.style.cursor = "pointer";
  };

  const update = (): void => {
    rafId = 0;
    const hit = hitAt(lastX, lastY);
    if (hit) showHover(hit);
    else clearHover();
  };

  const cancelPending = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (rafId === 0) rafId = requestAnimationFrame(update);
  };

  const onPointerLeave = (): void => {
    cancelPending();
    clearHover();
  };

  const onPointerDown = (e: PointerEvent): void => {
    downX = e.clientX;
    downY = e.clientY;
  };

  const onClick = (e: MouseEvent): void => {
    const moved = Number.isNaN(downX)
      ? 0
      : Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved >= CLICK_SLOP_PX) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit) return;
    try {
      void Promise.resolve(deps.openUrl(hit.url)).catch(() => {
        // Opener failures are non-fatal; the terminal keeps working.
      });
    } catch {
      // Synchronous opener failures too.
    }
  };

  /** Scrolling shifts rows under the pointer; the hover is stale. */
  const onScrollInvalidate = (): void => {
    cancelPending();
    clearHover();
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("click", onClick);
  host.addEventListener("wheel", onScrollInvalidate, { passive: true });
  host.addEventListener("scroll", onScrollInvalidate, {
    capture: true,
    passive: true,
  });

  return () => {
    cancelPending();
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("click", onClick);
    host.removeEventListener("wheel", onScrollInvalidate);
    host.removeEventListener("scroll", onScrollInvalidate, { capture: true });
    clearHover();
    if (tookOverPosition) host.style.position = prevInlinePosition;
  };
}
