/**
 * Pure geometry for the commit-graph rail: lane spacing, per-lane pixel
 * positions, and the total rail width. Shared by the {@link GraphRail}
 * component and the history layout constants; kept side-effect free so it can
 * be imported without pulling in React.
 */

export const LANE_WIDTH = 14;
export const RAIL_PADDING_X = 8;
export const MAX_VISIBLE_LANES = 6;

/** Horizontal pixel centre of the given lane index. */
export function laneX(lane: number): number {
  return RAIL_PADDING_X + lane * LANE_WIDTH;
}

/** Total rail width in pixels for a row spanning up to `maxLane` lanes. */
export function railWidth(maxLane: number): number {
  const visible = Math.min(maxLane, MAX_VISIBLE_LANES);
  return RAIL_PADDING_X * 2 + Math.max(0, visible - 1) * LANE_WIDTH + 6;
}
