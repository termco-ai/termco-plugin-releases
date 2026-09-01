/**
 * Find-in-block overlay: the on-demand search bar, visually attached to
 * the block it searches — anchored to the block container's top-right
 * corner and riding along as the stack scrolls, clamped to the pane so
 * it stays reachable while navigating matches in a block taller than
 * the viewport. Opened from a block header via the `termco:block-find`
 * window event. (Pane-wide search is ⌘F in the app header.)
 */

import { useEffect, useRef, useState } from "react";
import { BLOCK_FIND_EVENT, type BlockFindDetail } from "../lib/blockEvents";
import { SearchBar } from "./BlockSearchBar";
import type { OverlayProps } from "./blockOverlay.types";

const EDGE_PAD = 4;
const BAR_CLEARANCE = 36;

export function BlockOverlay(props: OverlayProps) {
  const [searchId, setSearchId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onFind = (e: Event) => {
      const detail = (e as CustomEvent<BlockFindDetail>).detail;
      if (detail.leafId === props.leafId) setSearchId(detail.blockId);
    };
    window.addEventListener(BLOCK_FIND_EVENT, onFind);
    return () => window.removeEventListener(BLOCK_FIND_EVENT, onFind);
  }, [props.leafId]);

  // Ride the block: reposition on every viewport event (scroll, writes,
  // relayout). Direct style writes — no React re-render per frame.
  useEffect(() => {
    if (!searchId) return;
    const position = () => {
      const anchor = anchorRef.current;
      const overlay = anchor?.parentElement;
      if (!anchor || !overlay) return;
      const block = overlay.ownerDocument.querySelector(
        `.term-block[data-block-id="${CSS.escape(searchId)}"]`,
      );
      const oRect = overlay.getBoundingClientRect();
      if (!block || oRect.height === 0) return; // scrolled out: keep last clamp
      const bRect = block.getBoundingClientRect();
      const top = Math.min(
        Math.max(bRect.top - oRect.top + EDGE_PAD, EDGE_PAD),
        oRect.height - BAR_CLEARANCE,
      );
      const right = Math.max(oRect.right - bRect.right + EDGE_PAD, EDGE_PAD);
      anchor.style.top = `${top}px`;
      anchor.style.right = `${right}px`;
    };
    position();
    const unsubscribe = props.subscribe(position);
    window.addEventListener("resize", position);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", position);
    };
  }, [searchId, props.subscribe]);

  if (!searchId) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div ref={anchorRef} className="bt-search-anchor">
        <SearchBar
          blockId={searchId}
          searchBlock={props.searchBlock}
          revealMatch={props.revealMatch}
          clearSearch={props.clearSearch}
          onClose={() => {
            props.clearSearch();
            setSearchId(null);
          }}
        />
      </div>
    </div>
  );
}
