import { describe, expect, it } from "vitest";
import { countDiffLines } from "./gitDiffStats";

describe("countDiffLines", () => {
  it("returns zero for an empty patch", () => {
    expect(countDiffLines("")).toEqual({ added: 0, removed: 0 });
  });

  it("counts added and removed lines", () => {
    const patch = [
      "@@ -1,3 +1,3 @@",
      " context",
      "-old line",
      "+new line",
      "+another new",
    ].join("\n");
    expect(countDiffLines(patch)).toEqual({ added: 2, removed: 1 });
  });

  it("ignores +++/--- file headers after the first line", () => {
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n");
    expect(countDiffLines(patch)).toEqual({ added: 1, removed: 1 });
  });

  it("does not count mid-line plus or minus characters", () => {
    const patch = ["@@ -1 +1 @@", " a + b - c"].join("\n");
    expect(countDiffLines(patch)).toEqual({ added: 0, removed: 0 });
  });

  it("counts a single added line at the start of the patch once", () => {
    expect(countDiffLines("+added")).toEqual({ added: 1, removed: 0 });
    expect(countDiffLines("-removed")).toEqual({ added: 0, removed: 1 });
  });

  it("ignores a --- file header on the first line", () => {
    const patch = ["--- a/file", "+++ b/file", "@@ -1 +1 @@", "-a", "+b"].join(
      "\n",
    );
    expect(countDiffLines(patch)).toEqual({ added: 1, removed: 1 });
  });

  it("counts a realistic patch that starts with a diff header", () => {
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "index 1111111..2222222 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,4 +1,4 @@",
      " keep",
      "-old one",
      "-old two",
      "+new one",
      "+new two",
      " keep",
    ].join("\n");
    expect(countDiffLines(patch)).toEqual({ added: 2, removed: 2 });
  });
});
