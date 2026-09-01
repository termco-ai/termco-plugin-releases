/**
 * Prop shapes for the find-in-block overlay. Block chrome itself is no
 * longer an overlay — it lives inside the real block containers (see
 * portal/BlockPortals); only the search bar still floats over the grid.
 */

import type { BlockMatch } from "../lib/blockDecorations";

/** Everything the search overlay needs from the owning terminal session. */
export type OverlayProps = {
  leafId: number;
  /** Viewport-change stream (scroll/write/relayout) for bar anchoring. */
  subscribe: (cb: () => void) => () => void;
  searchBlock: (id: string, query: string) => BlockMatch[];
  revealMatch: (m: BlockMatch) => void;
  clearSearch: () => void;
};
