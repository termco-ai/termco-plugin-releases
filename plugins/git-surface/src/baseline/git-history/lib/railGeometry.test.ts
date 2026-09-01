import { describe, expect, it } from "vitest";
import {
  LANE_WIDTH,
  laneX,
  MAX_VISIBLE_LANES,
  RAIL_PADDING_X,
  railWidth,
} from "./railGeometry";

describe("laneX", () => {
  it("centres lane 0 at the horizontal padding", () => {
    expect(laneX(0)).toBe(RAIL_PADDING_X);
  });

  it("rigs lanes by the lane width", () => {
    expect(laneX(1)).toBe(RAIL_PADDING_X + LANE_WIDTH);
    expect(laneX(3)).toBe(RAIL_PADDING_X + 3 * LANE_WIDTH);
  });
});

describe("railWidth", () => {
  it("gives a single lane both paddings plus the node margin", () => {
    expect(railWidth(1)).toBe(RAIL_PADDING_X * 2 + 6);
  });

  it("never goes below the single-lane width", () => {
    expect(railWidth(0)).toBe(railWidth(1));
  });

  it("grows linearly per extra visible lane", () => {
    expect(railWidth(3) - railWidth(2)).toBe(LANE_WIDTH);
  });

  it("clamps to the visible lane budget", () => {
    expect(railWidth(MAX_VISIBLE_LANES + 5)).toBe(railWidth(MAX_VISIBLE_LANES));
  });

  it("keeps the widest visible lane centre inside the rail", () => {
    expect(laneX(MAX_VISIBLE_LANES - 1)).toBeLessThan(
      railWidth(MAX_VISIBLE_LANES),
    );
  });
});
