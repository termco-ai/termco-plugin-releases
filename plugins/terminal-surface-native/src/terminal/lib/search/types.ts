/**
 * Engine-agnostic terminal search handle. The header search UI and the
 * pane plumbing hold this interface instead of xterm's `SearchAddon`
 * class; the addon satisfies it structurally today, and the wterm
 * search engine implements it after the engine swap.
 */

export type TerminalSearchOptions = {
  /** Restart from the top instead of advancing (live-typing mode). */
  incremental?: boolean;
  caseSensitive?: boolean;
  /**
   * xterm SearchAddon decoration colors; ignored by the wterm engine,
   * which styles matches via CSS.
   */
  decorations?: {
    matchOverviewRuler?: string;
    matchBackground?: string;
    activeMatchBackground?: string;
    activeMatchColorOverviewRuler?: string;
  };
};

export type TerminalSearchHandle = {
  findNext(query: string, options?: TerminalSearchOptions): boolean;
  findPrevious(query: string, options?: TerminalSearchOptions): boolean;
  clearDecorations(): void;
  /** Re-run the current query (after a buffer restore). Optional on xterm. */
  refresh?(query: string): void;
};
