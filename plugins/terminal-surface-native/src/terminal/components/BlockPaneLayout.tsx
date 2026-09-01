/**
 * Block-mode layout for a terminal pane: the wterm surface rendering in
 * blocks mode (real HTML block containers around each command's rows),
 * the React portals that fill the containers' header/body slots, the
 * first-run watermark, and the find-in-block search overlay.
 */

import type { CSSProperties, RefObject } from "react";
import { BlockOverlay } from "../block/components/BlockOverlay";
import { BlockWatermark } from "../block/components/BlockWatermark";
import { BlockPortals } from "../block/components/portal/BlockPortals";
import {
  focusLeafInput,
  type useTerminalSession,
} from "../lib/useTerminalSession";

type Props = {
  leafId: number;
  session: ReturnType<typeof useTerminalSession>;
  containerRef: RefObject<HTMLDivElement | null>;
  downYRef: RefObject<number | null>;
  hideStyle: CSSProperties;
  promptReady: boolean;
};

/**
 * Select a block's rendered output (its real row divs, or the widget body
 * when a widget replaced them). Returns true when a selection was made;
 * clicking an already-selected block clears it instead.
 */
function toggleBlockSelection(blockEl: HTMLElement): boolean {
  const target =
    (blockEl.querySelector(".term-block-rows")?.childElementCount ?? 0) > 0
      ? blockEl.querySelector(".term-block-rows")
      : blockEl.querySelector(".term-block-body");
  if (!target || target.childNodes.length === 0) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  // The focused docked input (CodeMirror) re-syncs the document selection
  // to its own state and would immediately clobber ours.
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(".cm-editor")) active.blur();
  const already =
    !sel.isCollapsed &&
    sel.rangeCount > 0 &&
    target.contains(sel.getRangeAt(0).commonAncestorContainer);
  sel.removeAllRanges();
  if (already) return true;
  const range = document.createRange();
  range.selectNodeContents(target);
  sel.addRange(range);
  return true;
}

export function BlockPaneLayout({
  leafId,
  session,
  containerRef,
  downYRef,
  hideStyle,
  promptReady,
}: Props) {
  return (
    <div
      data-terminal-padding
      className="zoom-exempt flex h-full w-full flex-col px-2"
      style={hideStyle}
    >
      <div className="relative min-h-0 flex-1">
        {/* Pane padding lives on the wrapper, NOT the measured container:
            the pool fits the grid to container.clientWidth, which would
            include the container's own padding. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: terminal surface; click returns focus to the docked input */}
        <div
          className="absolute inset-0 z-0"
          onMouseDown={(e) => {
            downYRef.current = e.clientY;
          }}
          onMouseUp={(e) => {
            const moved =
              downYRef.current != null &&
              Math.abs(e.clientY - downYRef.current) > 4;
            downYRef.current = null;
            if (moved) return; // a drag is a manual text selection
            // A plain click on a block selects its output (the Ask-Termco
            // pill rides on that selection); clicking the same block again
            // — or empty rig — clears it. At the prompt, empty-rig
            // clicks return focus to the docked input.
            const blockEl = (e.target as HTMLElement).closest?.(
              ".term-block",
            ) as HTMLElement | null;
            if (blockEl && toggleBlockSelection(blockEl)) return;
            if (session.blockMode === "prompt") focusLeafInput(leafId);
          }}
        >
          <div ref={containerRef} className="relative h-full w-full" />
        </div>
        <BlockWatermark leafId={leafId} subscribe={session.subscribeBlocks} />
        <BlockPortals
          leafId={leafId}
          session={session}
          promptReady={promptReady}
        />
        <BlockOverlay
          leafId={leafId}
          subscribe={session.subscribeBlocks}
          searchBlock={session.searchBlock}
          revealMatch={session.revealMatch}
          clearSearch={session.clearSearch}
        />
      </div>
    </div>
  );
}
