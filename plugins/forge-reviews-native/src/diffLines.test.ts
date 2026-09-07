import { describe, expect, it } from "vitest";
import { reviewDiffLines, reviewSplitDiffRows, reviewUnifiedDiffRows } from "./diffLines";

describe("reviewDiffLines", () => {
  it("keeps deletion runs before replacements in unified layout", () => {
    const rows = reviewUnifiedDiffRows("@@ -10,3 +20,2 @@\n-old one\n-old two\n+new\n context");
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({ old: { kind: "removed", line: 10, text: "old one" }, new: null }),
      expect.objectContaining({ old: { kind: "removed", line: 11, text: "old two" }, new: null }),
      expect.objectContaining({ old: null, new: { kind: "added", line: 20, text: "new" } }),
      expect.objectContaining({ old: { kind: "context", line: 12, text: "context" }, new: { kind: "context", line: 21, text: "context" } }),
    ]);
  });
  it("distinguishes file headers from increment/decrement code inside hunks", () => {
    const lines = reviewDiffLines("--- a/file.ts\n+++ b/file.ts\n@@ -1,2 +1,2 @@\n---counter;\n+++counter;\n next();");
    expect(lines.slice(3)).toEqual([
      expect.objectContaining({ kind: "removed", oldLine: 1 }),
      expect.objectContaining({ kind: "added", newLine: 1 }),
      expect.objectContaining({ kind: "context", oldLine: 2, newLine: 2 }),
    ]);
  });
  it("tracks old and new blob line numbers across a hunk", () => {
    const lines = reviewDiffLines(
      ["@@ -10,3 +20,3 @@", " context", "-removed", "+added", " context two"].join("\n"),
    );

    expect(lines).toEqual([
      expect.objectContaining({ kind: "hunk", oldLine: null, newLine: null }),
      expect.objectContaining({ kind: "context", oldLine: 10, newLine: 20 }),
      expect.objectContaining({ kind: "removed", oldLine: 11, newLine: null }),
      expect.objectContaining({ kind: "added", oldLine: null, newLine: 21 }),
      expect.objectContaining({ kind: "context", oldLine: 12, newLine: 22 }),
    ]);
  });

  it("aligns replacement blocks into old and new columns", () => {
    const rows = reviewSplitDiffRows(
      ["@@ -10,4 +20,3 @@", " context", "-old one", "-old two", "+new", " trailing"].join("\n"),
    );

    expect(rows).toEqual([
      expect.objectContaining({ kind: "hunk" }),
      expect.objectContaining({
        kind: "content",
        old: expect.objectContaining({ line: 10, text: "context" }),
        new: expect.objectContaining({ line: 20, text: "context" }),
      }),
      expect.objectContaining({
        kind: "content",
        old: expect.objectContaining({ kind: "removed", line: 11, text: "old one" }),
        new: expect.objectContaining({ kind: "added", line: 21, text: "new" }),
      }),
      expect.objectContaining({
        kind: "content",
        old: expect.objectContaining({ kind: "removed", line: 12, text: "old two" }),
        new: null,
      }),
      expect.objectContaining({
        kind: "content",
        old: expect.objectContaining({ line: 13, text: "trailing" }),
        new: expect.objectContaining({ line: 22, text: "trailing" }),
      }),
    ]);
  });
});
