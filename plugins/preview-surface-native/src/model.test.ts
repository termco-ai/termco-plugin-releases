import { describe, expect, it } from "vitest";
import { chordsFromSnapshot, normalizeUrl, rectsOverlap } from "./model";

describe("preview model", () => {
  it("normalizes common preview addresses", () => {
    expect(normalizeUrl("localhost:5173")).toBe("http://localhost:5173");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("  ")).toBeNull();
  });

  it("only sends modified shortcut chords to the native browser", () => {
    expect(chordsFromSnapshot({
      revision: 1,
      groups: [],
      overrides: {},
      shortcuts: [
        { id: "plain", label: "plain", group: "x", defaultBindings: [{ key: "a" }] },
        { id: "tab.selectByIndex", label: "tabs", group: "x", defaultBindings: [{ key: "1", meta: true }] },
      ],
    })).toHaveLength(9);
  });

  it("detects actual overlay intersection", () => {
    expect(rectsOverlap(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { left: 9, top: 9, right: 20, bottom: 20 },
    )).toBe(true);
    expect(rectsOverlap(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { left: 10, top: 10, right: 20, bottom: 20 },
    )).toBe(false);
  });
});
