import { describe, expect, it } from "vitest";
import { quadCandidatePoints } from "./actions";

describe("quadCandidatePoints", () => {
  it("returns the centroid first, then corner-nudged points", () => {
    // A 100×100 box at origin: corners (0,0)(100,0)(100,100)(0,100).
    const points = quadCandidatePoints([[0, 0, 100, 0, 100, 100, 0, 100]]);
    expect(points[0]).toEqual({ x: 50, y: 50 }); // centroid first
    expect(points).toHaveLength(5); // centroid + 4 nudged
    // Every point lies within the box.
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it("handles multiple quads (wrapped inline elements)", () => {
    const points = quadCandidatePoints([
      [0, 0, 10, 0, 10, 10, 0, 10],
      [20, 0, 30, 0, 30, 10, 20, 10],
    ]);
    expect(points[0]).toEqual({ x: 5, y: 5 });
    expect(points).toContainEqual({ x: 25, y: 5 });
  });

  it("skips malformed quads", () => {
    expect(quadCandidatePoints([[1, 2, 3]])).toEqual([]);
    expect(quadCandidatePoints([])).toEqual([]);
  });

  it("rounds to integer coordinates", () => {
    const points = quadCandidatePoints([[0, 0, 3, 0, 3, 3, 0, 3]]);
    for (const p of points) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });
});
