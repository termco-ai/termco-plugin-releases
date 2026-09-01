import { describe, expect, it } from "vitest";
import { computeLineStats } from "./aiDiffStats";

describe("computeLineStats", () => {
  it("returns zero for identical content", () => {
    const doc = "a\nb\nc\n";
    expect(computeLineStats(doc, doc)).toEqual({ added: 0, removed: 0 });
  });

  it("counts a pure insertion", () => {
    const original = "line1\nline3\n";
    const proposed = "line1\nline2\nline3\n";
    const stats = computeLineStats(original, proposed);
    expect(stats.added).toBeGreaterThanOrEqual(1);
    expect(stats.removed).toBe(0);
  });

  it("counts a pure deletion", () => {
    const original = "line1\nline2\nline3\n";
    const proposed = "line1\nline3\n";
    const stats = computeLineStats(original, proposed);
    expect(stats.removed).toBeGreaterThanOrEqual(1);
    expect(stats.added).toBe(0);
  });

  it("counts a single-line replacement as one added and one removed", () => {
    const original = "alpha\nbeta\ngamma\n";
    const proposed = "alpha\nBETA\ngamma\n";
    expect(computeLineStats(original, proposed)).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it("counts multi-line replacements", () => {
    const original = "a\nb\nc\nd\n";
    const proposed = "a\nx\ny\nz\nd\n";
    const stats = computeLineStats(original, proposed);
    expect(stats.added).toBe(3);
    expect(stats.removed).toBe(2);
  });

  it("handles a full rewrite from empty (new file)", () => {
    const stats = computeLineStats("", "one\ntwo\nthree");
    expect(stats.added).toBe(3);
    expect(stats.removed).toBe(0);
  });

  it("does not count the empty segment after a trailing newline", () => {
    const stats = computeLineStats("", "one\ntwo\n");
    expect(stats.added).toBe(2);
  });
});
