/**
 * The palette panel: it hangs off the bottom edge of the header search bar and
 * shares its width, with no top border and only the bottom corners rounded — so
 * bar and panel read as one shape that unfolded, not as a dialog that appeared.
 *
 * Positioned from the bar's box rather than nested inside it, so no ancestor's
 * overflow can clip it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EDGE = 12;
/** Overlap the bar's border by 1px so the seam is a single line. */
const SEAM = 1;

type Box = { top: number; left: number; width: number; maxHeight: number };

function place(bar: HTMLElement | null): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!bar) {
    const width = Math.min(440, vw - EDGE * 2);
    return {
      top: Math.round(vh * 0.12),
      left: Math.round((vw - width) / 2),
      width,
      maxHeight: Math.max(240, vh - Math.round(vh * 0.12) - EDGE),
    };
  }
  const r = bar.getBoundingClientRect();
  const top = r.bottom - SEAM;
  return {
    top,
    left: r.left,
    width: r.width,
    maxHeight: Math.max(200, vh - top - EDGE),
  };
}

export function PalettePopout({
  open,
  onClose,
  bar,
  children,
}: {
  open: boolean;
  onClose: () => void;
  bar: HTMLElement | null;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(() => place(null));

  // Measure before paint so the panel never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (!open) return;
    setBox(place(bar));
  }, [open, bar]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => setBox(place(bar));
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open, bar]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // The bar hosts the palette's own input — clicking it must not close.
      if (bar?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture: terminal/editor surfaces stop propagation in their own handlers.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, bar, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Command palette"
      data-state="open"
      data-testid="palette-popout"
      className="termco-floating fixed z-50 flex flex-col overflow-hidden rounded-b-[13px] border-t-0 animate-in fade-in-0 slide-in-from-top-1 duration-[var(--dur-fast)]"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
