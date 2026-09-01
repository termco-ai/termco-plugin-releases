/**
 * Rendering helpers for full-log search results. Pure; unit-tested.
 */
import type { LogMatch, LogSearchResult } from "../types";

/**
 * Render matches as line-numbered text for the read-only viewer: the real
 * position in the full log, right-aligned, then the matching line. So the user
 * sees WHERE each hit is, even for lines never fetched into the tail view.
 */
export function formatMatchLines(matches: LogMatch[]): string {
  if (matches.length === 0) return "";
  const width = String(matches[matches.length - 1].line).length;
  return matches
    .map((m) => `${String(m.line).padStart(width)}  ${m.text}`)
    .join("\n");
}

/** Toolbar summary for a search result (or in-flight / idle state). */
export function searchSummary(
  result: LogSearchResult | null,
  loading: boolean,
): string {
  if (loading) return "Searching…";
  if (!result) return "";
  if (result.matched === 0) return "No matches";
  const n = result.matched.toLocaleString();
  return `${n}${result.truncated ? "+" : ""} ${
    result.matched === 1 ? "match" : "matches"
  }`;
}
