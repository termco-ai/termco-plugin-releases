import { describe, expect, it } from "vitest";
import { basename, parentOf } from "./explorerPaths";

describe("basename", () => {
  it("returns the last segment of a unix path", () => {
    expect(basename("/home/user/project")).toBe("project");
  });

  it("handles trailing slashes", () => {
    expect(basename("/home/user/project/")).toBe("project");
  });

  it("splits on backslashes for windows paths", () => {
    expect(basename("C:\\Users\\foo\\bar")).toBe("bar");
  });

  it("handles mixed separators", () => {
    expect(basename("C:/Users\\foo/bar")).toBe("bar");
  });

  it("returns the input when there is no segment", () => {
    expect(basename("")).toBe("");
    expect(basename("/")).toBe("/");
  });

  it("returns a bare name unchanged", () => {
    expect(basename("file.txt")).toBe("file.txt");
  });
});

describe("parentOf", () => {
  it("returns the parent directory", () => {
    expect(parentOf("/a/b/c", "/root")).toBe("/a/b");
  });

  it("falls back for top-level paths", () => {
    expect(parentOf("/a", "/root")).toBe("/root");
  });

  it("falls back when there is no slash", () => {
    expect(parentOf("plain", "/root")).toBe("/root");
  });
});
