/**
 * Pane-tree public surface. Re-exports the data model (`./types`) and the pure
 * tree transforms (`./ops`) so `@/modules/terminal/lib/panes` resolves here and
 * keeps the same symbols external callers (rigs, tabs) already import.
 */

export * from "./ops";
export * from "./types";
