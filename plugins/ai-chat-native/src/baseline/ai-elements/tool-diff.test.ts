import { describe, expect, it } from "vitest";
import { diffCounts, diffFromInput, lineDiff, parsePatch } from "./tool-diff";

describe("lineDiff", () => {
  it("marks added and removed lines", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc");
    expect(d).toEqual([
      { kind: "context", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "context", text: "c" },
    ]);
  });

  it("treats an empty original as all additions", () => {
    const d = lineDiff("", "x\ny");
    expect(diffCounts(d)).toEqual({ added: 2, removed: 0 });
  });

  it("degrades gracefully past the line cap", () => {
    const big = Array.from({ length: 500 }, (_, i) => `l${i}`).join("\n");
    const d = lineDiff(big, big + "\nextra");
    // blunt block fallback: all dels then all adds, capped
    expect(d.some((l) => l.kind === "del")).toBe(true);
    expect(d.some((l) => l.kind === "add")).toBe(true);
  });
});

describe("parsePatch", () => {
  it("classifies +/- and context lines", () => {
    const d = parsePatch("@@ -1 +1 @@\n-old\n+new\n unchanged");
    expect(d).toEqual([
      { kind: "context", text: "@@ -1 +1 @@" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "context", text: "unchanged" },
    ]);
  });
});

describe("diffFromInput", () => {
  it("Edit uses old_string/new_string", () => {
    const r = diffFromInput("Edit", {
      file_path: "/x.ts",
      old_string: "foo",
      new_string: "bar",
    });
    expect(r?.path).toBe("/x.ts");
    expect(diffCounts(r!.lines)).toEqual({ added: 1, removed: 1 });
  });

  it("Write is all additions", () => {
    const r = diffFromInput("Write", { file_path: "/n.ts", content: "a\nb" });
    expect(diffCounts(r!.lines)).toEqual({ added: 2, removed: 0 });
  });

  it("MultiEdit concatenates edits", () => {
    const r = diffFromInput("MultiEdit", {
      file_path: "/m.ts",
      edits: [
        { old_string: "a", new_string: "A" },
        { old_string: "b", new_string: "B" },
      ],
    });
    expect(diffCounts(r!.lines)).toEqual({ added: 2, removed: 2 });
  });

  it("apply_patch parses a unified patch", () => {
    const r = diffFromInput("apply_patch", { patch: "-x\n+y" });
    expect(diffCounts(r!.lines)).toEqual({ added: 1, removed: 1 });
  });

  it("returns null for a non-mutation tool", () => {
    expect(diffFromInput("Bash", { command: "ls" })).toBeNull();
  });
});
