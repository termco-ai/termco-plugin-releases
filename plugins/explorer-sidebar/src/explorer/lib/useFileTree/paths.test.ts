import { describe, expect, it } from "vitest";
import { dirname, joinPath } from "./paths";

describe("joinPath", () => {
  it("joins with a single separator", () => {
    expect(joinPath("/a/b", "c")).toBe("/a/b/c");
  });

  it("does not double the separator for trailing-slash parents", () => {
    expect(joinPath("/a/b/", "c")).toBe("/a/b/c");
    expect(joinPath("/", "c")).toBe("/c");
  });
});

describe("dirname", () => {
  it("returns the parent directory", () => {
    expect(dirname("/a/b/c")).toBe("/a/b");
  });

  it("returns / for top-level entries", () => {
    expect(dirname("/a")).toBe("/");
  });

  it("returns / when there is no separator", () => {
    expect(dirname("plain")).toBe("/");
  });
});
