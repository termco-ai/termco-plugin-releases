/**
 * Find-in-block search bar. Pinned to the top of the terminal so it stays put
 * while navigating matches (the grid scrolls underneath). Drives the session's
 * per-block search and reveals each match in turn.
 */

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  type Copy01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import type { BlockMatch } from "../lib/blockDecorations";

// One fixed search bar pinned to the top of the terminal so it stays put while
// navigating matches (the grid scrolls underneath).
export function SearchBar({
  blockId,
  searchBlock,
  revealMatch,
  clearSearch,
  onClose,
}: {
  blockId: string;
  searchBlock: (id: string, query: string) => BlockMatch[];
  revealMatch: (m: BlockMatch) => void;
  clearSearch: () => void;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<BlockMatch[]>([]);
  const [idx, setIdx] = useState(0);
  // Rapid next/next/next (Enter held, fast clicks) outpaces re-renders;
  // the ref keeps every step, state only drives the "n/m" display.
  const idxRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = (query: string) => {
    const m = searchBlock(blockId, query);
    setMatches(m);
    idxRef.current = 0;
    setIdx(0);
    if (m.length) revealMatch(m[0]);
    // A now-empty query must not leave the previous match highlighted.
    else clearSearch();
  };
  const nav = (dir: number) => {
    if (!matches.length) return;
    const next = (idxRef.current + dir + matches.length) % matches.length;
    idxRef.current = next;
    setIdx(next);
    revealMatch(matches[next]);
  };

  return (
    <div className="bt-search pointer-events-auto">
      <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={1.75} />
      <input
        ref={inputRef}
        className="bt-search-input"
        placeholder="Find in block"
        onChange={(e) => run(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            nav(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="bt-search-count">
        {matches.length ? `${idx + 1}/${matches.length}` : "0"}
      </span>
      <SearchBtn
        title="Previous"
        icon={ArrowUp01Icon}
        onClick={() => nav(-1)}
      />
      <SearchBtn title="Next" icon={ArrowDown01Icon} onClick={() => nav(1)} />
      <SearchBtn title="Close" icon={Cancel01Icon} onClick={onClose} />
    </div>
  );
}

function SearchBtn({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: typeof Copy01Icon;
  onClick: () => void;
}) {
  return (
    <button type="button" title={title} onClick={onClick} className="bt-btn">
      <HugeiconsIcon icon={icon} size={13} strokeWidth={1.75} />
    </button>
  );
}
