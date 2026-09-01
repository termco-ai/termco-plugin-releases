import { describe, expect, it } from "vitest";
import {
  FILES_CACHE_LIMIT,
  GRID_TEMPLATE,
  NEAR_BOTTOM_PX,
  PAGE_SIZE,
  ROW_HEIGHT,
  TABLE_HEADER_HEIGHT,
} from "./constants";
import { MAX_VISIBLE_LANES, railWidth } from "./railGeometry";

describe("git-history layout constants", () => {
  it("reserves the full rail width in the shared grid template", () => {
    // Rows and the table header share this template; the first column must
    // fit the widest possible rail or the columns drift out of alignment.
    expect(
      GRID_TEMPLATE.startsWith(`${railWidth(MAX_VISIBLE_LANES) + 4}px `),
    ).toBe(true);
  });

  it("defines the seven history columns", () => {
    expect(GRID_TEMPLATE.trim().split(/\s+(?![^(]*\))/)).toHaveLength(7);
  });

  it("keeps paging thresholds coherent", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(ROW_HEIGHT).toBeGreaterThan(0);
    expect(TABLE_HEADER_HEIGHT).toBeGreaterThan(0);
    // The near-bottom trigger must cover at least a few rows, or paging
    // would only fire after the user hits the exact end.
    expect(NEAR_BOTTOM_PX).toBeGreaterThanOrEqual(ROW_HEIGHT * 3);
    expect(FILES_CACHE_LIMIT).toBeGreaterThanOrEqual(1);
  });
});
