import { describe, expect, it } from "vitest";
import { segmentsFromCwd } from "./pathUtils";

describe("segmentsFromCwd", () => {
  it("splits a plain unix path from the root", () => {
    expect(segmentsFromCwd("/usr/local/bin", null)).toEqual([
      { label: "/", fullPath: "/", isHome: false },
      { label: "usr", fullPath: "/usr", isHome: false },
      { label: "local", fullPath: "/usr/local", isHome: false },
      { label: "bin", fullPath: "/usr/local/bin", isHome: false },
    ]);
  });

  it("returns only the root segment for /", () => {
    expect(segmentsFromCwd("/", null)).toEqual([
      { label: "/", fullPath: "/", isHome: false },
    ]);
  });

  it("collapses the home prefix to ~", () => {
    expect(segmentsFromCwd("/Users/kevin/dev/app", "/Users/kevin")).toEqual([
      { label: "~", fullPath: "/Users/kevin", isHome: true },
      { label: "dev", fullPath: "/Users/kevin/dev", isHome: false },
      { label: "app", fullPath: "/Users/kevin/dev/app", isHome: false },
    ]);
  });

  it("does not treat a sibling sharing the home prefix as home", () => {
    const segments = segmentsFromCwd("/Users/kevinx", "/Users/kevin");
    expect(segments[0]).toEqual({ label: "/", fullPath: "/", isHome: false });
    expect(segments.map((segment) => segment.label)).toEqual([
      "/",
      "Users",
      "kevinx",
    ]);
  });

  it("handles Windows drives, roots, homes, and mixed separators", () => {
    expect(segmentsFromCwd("C:\\Users\\foo", null)).toEqual([
      { label: "C:", fullPath: "C:/", isHome: false },
      { label: "Users", fullPath: "C:/Users", isHome: false },
      { label: "foo", fullPath: "C:/Users/foo", isHome: false },
    ]);
    expect(segmentsFromCwd("D:", null)).toEqual([
      { label: "D:", fullPath: "D:/", isHome: false },
    ]);
    expect(segmentsFromCwd("C:\\Users\\foo\\proj", "C:/Users/foo")).toEqual([
      { label: "~", fullPath: "C:/Users/foo", isHome: true },
      { label: "proj", fullPath: "C:/Users/foo/proj", isHome: false },
    ]);
  });

  it("ignores duplicate slashes in the tail", () => {
    expect(segmentsFromCwd("/a//b", null).map((segment) => segment.label)).toEqual([
      "/",
      "a",
      "b",
    ]);
  });
});
