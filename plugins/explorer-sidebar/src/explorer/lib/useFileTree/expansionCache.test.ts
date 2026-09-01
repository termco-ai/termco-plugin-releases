import { describe, expect, it } from "vitest";
import { recallExpansion, rememberExpansion } from "./expansionCache";

describe("expansionCache", () => {
  it("returns an empty array for unknown roots", () => {
    expect(recallExpansion("/nowhere")).toEqual([]);
  });

  it("round-trips an expansion set", () => {
    rememberExpansion("/root-a", new Set(["/root-a/src", "/root-a/lib"]));
    expect(recallExpansion("/root-a")).toEqual(["/root-a/src", "/root-a/lib"]);
  });

  it("clears the stored value when the set is empty", () => {
    rememberExpansion("/root-b", new Set(["/root-b/src"]));
    rememberExpansion("/root-b", new Set());
    expect(recallExpansion("/root-b")).toEqual([]);
  });

  it("evicts the least-recently-used root beyond the limit", () => {
    for (let i = 0; i < 8; i++) {
      rememberExpansion(`/lru-${i}`, new Set([`/lru-${i}/x`]));
    }
    // Touch /lru-0 so it becomes most-recently-used.
    expect(recallExpansion("/lru-0")).toEqual(["/lru-0/x"]);
    rememberExpansion("/lru-extra", new Set(["/lru-extra/x"]));
    expect(recallExpansion("/lru-1")).toEqual([]);
    expect(recallExpansion("/lru-0")).toEqual(["/lru-0/x"]);
    expect(recallExpansion("/lru-extra")).toEqual(["/lru-extra/x"]);
  });
});
