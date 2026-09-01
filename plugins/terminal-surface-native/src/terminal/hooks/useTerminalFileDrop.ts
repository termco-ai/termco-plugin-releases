import { useEffect } from "react";
import { terminalRuntime } from "../../runtime";
import { useTerminalDropStore } from "../lib/dropStore";
import { formatDroppedPaths } from "../lib/quoteShellPath";
import { pasteIntoLeaf } from "../lib/rendererPool";

// The drop point may arrive in physical pixels on some platforms and logical
// on others; only scale down when it overflows the logical viewport.
function leafIdAt(x: number, y: number): number | null {
  let lx = x;
  let ly = y;
  if (x > window.innerWidth || y > window.innerHeight) {
    const dpr = window.devicePixelRatio || 1;
    lx = x / dpr;
    ly = y / dpr;
  }
  const el = document.elementFromPoint(lx, ly);
  const leafEl = el?.closest<HTMLElement>("[data-pane-leaf]");
  if (!leafEl) return null;
  const id = Number(leafEl.dataset.paneLeaf);
  return Number.isFinite(id) ? id : null;
}

/** Wires native OS file drops into the terminal pane under the cursor: shows a
 * drop overlay on that pane while dragging, and bracketed-pastes the
 * shell-quoted path(s) on drop. Drops outside any terminal leaf are ignored. */
export function useTerminalFileDrop(): void {
  useEffect(() => {
    const setTarget = useTerminalDropStore.getState().setTarget;
    const unsubscribe = terminalRuntime().desktop.subscribeDragDrop((event) => {
      if (event.type === "enter" || event.type === "over") {
        setTarget(leafIdAt(event.position.x, event.position.y));
        return;
      }
      if (event.type === "leave") {
        setTarget(null);
        return;
      }
      setTarget(null);
      if (event.paths.length === 0) return;
      const leafId = leafIdAt(event.position.x, event.position.y);
      if (leafId !== null) {
        pasteIntoLeaf(leafId, formatDroppedPaths(event.paths));
      }
    });

    return () => {
      setTarget(null);
      unsubscribe();
    };
  }, []);
}
