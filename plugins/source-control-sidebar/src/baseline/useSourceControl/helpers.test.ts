import type { GitStatusSnapshot } from "@termco/git-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_FETCH_LRU_LIMIT,
  getContextualAction,
  normalizeError,
  touchAutoFetch,
} from "./helpers";

function snapshot(overrides: Partial<GitStatusSnapshot>): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
    ...overrides,
  };
}

describe("normalizeError", () => {
  it("passes strings through", () => {
    expect(normalizeError("boom")).toBe("boom");
  });

  it("extracts message from Error objects", () => {
    expect(normalizeError(new Error("failed"))).toBe("failed");
  });

  it("extracts message from plain objects", () => {
    expect(normalizeError({ message: "nope" })).toBe("nope");
  });

  it("falls back for non-string messages", () => {
    expect(normalizeError({ message: 42 })).toBe(
      "Unknown source control error",
    );
  });

  it("falls back for null, undefined and numbers", () => {
    expect(normalizeError(null)).toBe("Unknown source control error");
    expect(normalizeError(undefined)).toBe("Unknown source control error");
    expect(normalizeError(7)).toBe("Unknown source control error");
  });
});

describe("getContextualAction", () => {
  it("returns null without a status", () => {
    expect(getContextualAction(null)).toBeNull();
  });

  it("returns null without an upstream", () => {
    expect(getContextualAction(snapshot({ upstream: null }))).toBeNull();
  });

  it("returns null when diverged", () => {
    expect(getContextualAction(snapshot({ ahead: 2, behind: 1 }))).toBeNull();
  });

  it("returns pull when only behind", () => {
    expect(getContextualAction(snapshot({ behind: 3 }))).toBe("pull");
  });

  it("returns push when only ahead", () => {
    expect(getContextualAction(snapshot({ ahead: 1 }))).toBe("push");
  });

  it("returns fetch when in sync", () => {
    expect(getContextualAction(snapshot({}))).toBe("fetch");
  });
});

describe("touchAutoFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the current time for the key", () => {
    const map = new Map<string, number>();
    touchAutoFetch(map, "/repo");
    expect(map.get("/repo")).toBe(1_000_000);
  });

  it("moves an existing key to the most-recent position", () => {
    const map = new Map<string, number>([
      ["/a", 1],
      ["/b", 2],
    ]);
    touchAutoFetch(map, "/a");
    expect([...map.keys()]).toEqual(["/b", "/a"]);
  });

  it("evicts the oldest entries beyond the LRU limit", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < AUTO_FETCH_LRU_LIMIT; i++) {
      map.set(`/repo-${i}`, i);
    }
    touchAutoFetch(map, "/fresh");
    expect(map.size).toBe(AUTO_FETCH_LRU_LIMIT);
    expect(map.has("/repo-0")).toBe(false);
    expect(map.has("/fresh")).toBe(true);
  });
});
