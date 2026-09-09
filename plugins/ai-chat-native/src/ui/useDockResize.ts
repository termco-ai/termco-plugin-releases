import { WORKSPACE_SURFACE_ATTR } from "@termco/ui-shell-base";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const MIN_DOCK_WIDTH = 360;
export const DEFAULT_DOCK_WIDTH = 384;

/** The dock can expand across the editor up to the shell's public workspace
 * boundary. Its regular footprint stays bounded so the sidebar does not move. */
export function useDockResize(open: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_DOCK_WIDTH);
  const [fillAvailable, setFillAvailable] = useState(false);
  const [maximum, setMaximum] = useState(DEFAULT_DOCK_WIDTH);
  const minimum = Math.min(MIN_DOCK_WIDTH, maximum);
  const width = fillAvailable ? maximum : Math.min(maximum, Math.max(minimum, preferredWidth));
  const drag = useRef<{
    pointerId: number; startX: number; startWidth: number; element: HTMLDivElement;
  } | null>(null);
  const endDrag = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    if (current?.element.hasPointerCapture(current.pointerId)) {
      current.element.releasePointerCapture(current.pointerId);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("blur", endDrag);
    return () => {
      endDrag();
      window.removeEventListener("blur", endDrag);
    };
  }, [open, endDrag]);

  useEffect(() => {
    if (!open) return;
    const workspace = document.querySelector<HTMLElement>(`[${WORKSPACE_SURFACE_ATTR}]`);
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = document.querySelector<HTMLElement>(`[${WORKSPACE_SURFACE_ATTR}]`)?.getBoundingClientRect();
      const left = rect && rect.width > 0 ? rect.left : 0;
      setMaximum(Math.max(0, panel.getBoundingClientRect().right - left));
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (workspace) observer.observe(workspace);
    observer.observe(document.documentElement);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [open]);

  const resize = (next: number) => {
    setFillAvailable(next >= maximum);
    setPreferredWidth(Math.min(maximum, Math.max(minimum, next)));
  };

  return {
    panelRef,
    width,
    minimum,
    maximum,
    // Expansion covers the editor while preserving the sidebar's geometry.
    marginLeft: Math.min(0, DEFAULT_DOCK_WIDTH - width),
    separatorProps: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, element: event.currentTarget };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        resize(current.startWidth - (event.clientX - current.startX));
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "ArrowLeft") resize(width + 32);
        else if (event.key === "ArrowRight") resize(width - 32);
        else if (event.key === "Home") resize(minimum);
        else if (event.key === "End") resize(maximum);
        else return;
        event.preventDefault();
      },
    },
  };
}
