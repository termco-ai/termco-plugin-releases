/**
 * Header-driven search state for the git-history pane.
 *
 * Owns the search input, exposes an imperative handle to the header search
 * bar, and derives the debounced "active" query used for filtering.
 */
import { useDeferredValue, useEffect, useState } from "react";
import type { GitHistorySearchHandle } from "../types";

/**
 * Manage the pane's search query and register/unregister the imperative
 * search handle with the header. Returns the `activeSearch` string that
 * commit filtering should use.
 *
 * @param onSearchHandle Optional callback the header uses to drive filtering.
 */
export function useHistorySearch(
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void,
): string {
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput.trim());
  // Require at least 2 characters before filtering to avoid noisy single-char
  // matches and pointless full-list scans on every keystroke.
  const activeSearch = deferredSearch.length >= 2 ? deferredSearch : "";

  useEffect(() => {
    onSearchHandle?.({
      setQuery: (query: string) => setSearchInput(query),
      clearQuery: () => setSearchInput(""),
    });
    return () => onSearchHandle?.(null);
  }, [onSearchHandle]);

  return activeSearch;
}
