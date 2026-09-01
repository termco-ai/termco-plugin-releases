import { describe, expect, it } from "vitest";
import { basename, diffStats } from "./diffUtils";

describe("basename", () => {
  it("returns the last unix segment", () => {
    expect(basename("/home/me/project/file.rs")).toBe("file.rs");
  });

  it("returns the last windows segment", () => {
    expect(basename("C:\\repo\\src\\main.rs")).toBe("main.rs");
  });

  it("returns the input when no separator exists", () => {
    expect(basename("README.md")).toBe("README.md");
  });

  it("returns an empty string for a trailing separator", () => {
    expect(basename("/a/b/")).toBe("");
  });
});

describe("diffStats", () => {
  it("reports zero for identical content", () => {
    expect(diffStats("a\nb", "a\nb")).toEqual({ added: 0, removed: 0 });
  });

  it("counts added lines", () => {
    expect(diffStats("a", "a\nb\nc")).toEqual({ added: 2, removed: 0 });
  });

  it("counts removed lines", () => {
    expect(diffStats("a\nb\nc", "a")).toEqual({ added: 0, removed: 2 });
  });

  it("counts changed lines as one add plus one remove", () => {
    expect(diffStats("a\nold\nz", "a\nnew\nz")).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it("treats a full rewrite of an empty file as additions plus the removed empty line", () => {
    expect(diffStats("", "x\ny")).toEqual({ added: 2, removed: 1 });
  });

  it("counts duplicate new lines once per occurrence", () => {
    expect(diffStats("a", "a\nc\nc")).toEqual({ added: 2, removed: 0 });
  });

  it("does not count lines that merely moved", () => {
    expect(diffStats("a\nb", "b\na")).toEqual({ added: 0, removed: 0 });
  });
});
