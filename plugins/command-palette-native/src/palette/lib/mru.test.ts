// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mruRank, mruSnapshot, recordUse } from "./mru";
import { MemoryStorage } from "../testStorage";

const KEY = "termco-palette-mru";

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("mru", () => {
  it("records usage timestamps by id", () => {
    const before = Date.now();
    recordUse("tab.new");
    const snap = mruSnapshot();
    expect(snap["tab.new"]).toBeGreaterThanOrEqual(before);
  });

  it("ranks unknown ids as 0", () => {
    expect(mruRank({}, "nope")).toBe(0);
    expect(mruRank({ a: 5 }, "a")).toBe(5);
  });

  it("returns an empty snapshot for corrupt storage", () => {
    localStorage.setItem(KEY, "{not json");
    expect(mruSnapshot()).toEqual({});
  });

  it("evicts the oldest entries beyond the cap", () => {
    const map: Record<string, number> = {};
    for (let i = 0; i < 121; i++) map[`cmd${i}`] = i + 1;
    localStorage.setItem(KEY, JSON.stringify(map));
    recordUse("fresh");
    const snap = mruSnapshot();
    // 122 candidates capped at 120: the two stalest fall off.
    expect(Object.keys(snap)).toHaveLength(120);
    expect(snap.cmd0).toBeUndefined();
    expect(snap.cmd1).toBeUndefined();
    expect(snap.fresh).toBeDefined();
    expect(snap.cmd120).toBeDefined();
  });

  it("swallows storage write failures", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => recordUse("x")).not.toThrow();
  });
});
