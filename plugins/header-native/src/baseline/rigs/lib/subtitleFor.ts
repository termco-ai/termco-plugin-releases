/**
 * Derives the secondary line shown under a tab in the rig switcher.
 */

import type { Tab } from "../../types";

/**
 * Compute the muted subtitle for a tab row (e.g. the last couple of path
 * segments), or `null` when the tab has nothing meaningful to show.
 */
export function subtitleFor(tab: Tab): string | null {
  if (tab.kind === "terminal") {
    if (!tab.cwd) return null;
    const segs = tab.cwd.split(/[\\/]/).filter(Boolean);
    return segs.slice(-2).join("/") || tab.cwd;
  }
  if (tab.kind === "editor" || tab.kind === "markdown") {
    if (!tab.path) return null;
    const segs = tab.path.split(/[\\/]/).filter(Boolean);
    return segs.slice(-2, -1)[0] ?? null;
  }
  return null;
}
