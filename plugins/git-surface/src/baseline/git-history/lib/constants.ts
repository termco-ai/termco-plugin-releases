/**
 * Layout and pagination constants for the git-history pane.
 *
 * Centralised here so the container, hooks, and row components share one
 * source of truth for the virtualised grid geometry and paging thresholds.
 */
import { MAX_VISIBLE_LANES, railWidth } from "./railGeometry";

/** Horizontal rig reserved for the commit-graph rail column. */
const RAIL_RESERVED_PX = railWidth(MAX_VISIBLE_LANES);

/**
 * CSS grid template for a commit row and the table header, so both align.
 * Columns: rail | sha | subject(capped) | spacer(absorbs slack) |
 * author(hugs) | date | changes.
 */
export const GRID_TEMPLATE = `${RAIL_RESERVED_PX + 4}px 60px minmax(0, 560px) minmax(12px, 1fr) minmax(140px, max-content) 96px 116px`;

/** Number of commits fetched per `git log` page. */
export const PAGE_SIZE = 30;
/** Fixed height of a virtualised commit row, in pixels. */
export const ROW_HEIGHT = 40;
/** Height of the sticky table header, in pixels. */
export const TABLE_HEADER_HEIGHT = 24;
/** Distance from the bottom (px) that triggers loading the next page. */
export const NEAR_BOTTOM_PX = 240;
/** Max number of per-commit file lists retained in the LRU cache. */
export const FILES_CACHE_LIMIT = 16;
