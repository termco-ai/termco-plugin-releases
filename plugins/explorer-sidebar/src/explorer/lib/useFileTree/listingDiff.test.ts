import { describe, expect, it } from "vitest";
import { isUnder, sameDirListing } from "./listingDiff";
import type { DirEntry } from "./types";

function entry(overrides: Partial<DirEntry> = {}): DirEntry {
  return {
    name: "a.ts",
    kind: "file",
    size: 1,
    mtime: 1,
    gitignored: false,
    ...overrides,
  };
}

describe("isUnder", () => {
  it("matches the root itself", () => {
    expect(isUnder("/a/b", "/a/b")).toBe(true);
  });

  it("matches descendants", () => {
    expect(isUnder("/a/b/c/d", "/a/b")).toBe(true);
  });

  it("rejects siblings sharing a prefix", () => {
    expect(isUnder("/a/bc", "/a/b")).toBe(false);
  });

  it("matches descendants of the filesystem root", () => {
    // An ssh rig homed at "/" has explorerRoot "/" — a naive `${root}/`
    // prefix would be "//" and reject everything.
    expect(isUnder("/boot", "/")).toBe(true);
    expect(isUnder("/boot/grub", "/")).toBe(true);
    expect(isUnder("/", "/")).toBe(true);
  });

  it("rejects ancestors", () => {
    expect(isUnder("/a", "/a/b")).toBe(false);
  });
});

describe("sameDirListing", () => {
  it("treats identical listings as equal", () => {
    const a = [entry(), entry({ name: "dir", kind: "dir" })];
    const b = [entry(), entry({ name: "dir", kind: "dir" })];
    expect(sameDirListing(a, b)).toBe(true);
  });

  it("ignores mtime and size changes", () => {
    const a = [entry({ mtime: 1, size: 10 })];
    const b = [entry({ mtime: 2, size: 20 })];
    expect(sameDirListing(a, b)).toBe(true);
  });

  it("detects length differences", () => {
    expect(sameDirListing([entry()], [])).toBe(false);
  });

  it("detects name changes", () => {
    expect(sameDirListing([entry()], [entry({ name: "b.ts" })])).toBe(false);
  });

  it("detects kind changes", () => {
    expect(sameDirListing([entry()], [entry({ kind: "dir" })])).toBe(false);
  });

  it("detects gitignored changes", () => {
    expect(sameDirListing([entry()], [entry({ gitignored: true })])).toBe(
      false,
    );
  });
});
