import { describe, expect, it } from "vitest";
import { LRU } from "./lru";

describe("LRU", () => {
  it("stores and retrieves values", () => {
    const lru = new LRU<string, number>(2);
    lru.set("a", 1);
    expect(lru.get("a")).toBe(1);
    expect(lru.get("missing")).toBeUndefined();
  });

  it("evicts the oldest entry past capacity", () => {
    const lru = new LRU<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("c", 3);
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBe(2);
    expect(lru.get("c")).toBe(3);
  });

  it("promotes an entry on get so it survives eviction", () => {
    const lru = new LRU<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    expect(lru.get("a")).toBe(1);
    expect(lru.get("b")).toBeUndefined();
  });

  it("re-setting an existing key refreshes its position and value", () => {
    const lru = new LRU<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 10);
    lru.set("c", 3);
    expect(lru.get("a")).toBe(10);
    expect(lru.get("b")).toBeUndefined();
  });

  it("clear empties the cache", () => {
    const lru = new LRU<string, number>(2);
    lru.set("a", 1);
    lru.clear();
    expect(lru.get("a")).toBeUndefined();
  });
});
