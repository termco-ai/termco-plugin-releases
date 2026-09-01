import { describe, expect, it } from "vitest";
import { stripUserContextBlocks } from "./contextBlocks";

describe("stripUserContextBlocks", () => {
  it("returns plain text untouched with no chips", () => {
    const r = stripUserContextBlocks("fix the build");
    expect(r.text).toBe("fix the build");
    expect(r.chips).toEqual([]);
  });

  it("extracts a terminal selection with a line count", () => {
    const r = stripUserContextBlocks(
      '<selection source="terminal">\nline1\nline2\n</selection>explain',
    );
    expect(r.text).toBe("explain");
    expect(r.chips).toEqual([
      { kind: "selection", source: "terminal", lines: 2 },
    ]);
  });

  it("extracts an editor selection", () => {
    const r = stripUserContextBlocks(
      '<selection source="editor">const a = 1;</selection>',
    );
    expect(r.chips).toEqual([
      { kind: "selection", source: "editor", lines: 1 },
    ]);
  });

  it("counts an empty selection body as zero lines", () => {
    const r = stripUserContextBlocks(
      '<selection source="terminal"></selection>hi',
    );
    expect(r.chips).toEqual([
      { kind: "selection", source: "terminal", lines: 0 },
    ]);
  });

  it("ignores trailing newlines when counting lines", () => {
    const r = stripUserContextBlocks(
      '<selection source="terminal">\na\nb\n\n\n</selection>',
    );
    expect(r.chips[0]).toMatchObject({ lines: 2 });
  });

  it("extracts file blocks with name and line count", () => {
    const r = stripUserContextBlocks(
      '<file name="main.ts" lang="ts">\nl1\nl2\nl3\n</file>go',
    );
    expect(r.text).toBe("go");
    expect(r.chips).toEqual([{ kind: "file", name: "main.ts", lines: 3 }]);
  });

  it("extracts snippet blocks by name and discards the body", () => {
    const r = stripUserContextBlocks(
      '<snippet name="deploy">\nsecret body\n</snippet>run it',
    );
    expect(r.text).toBe("run it");
    expect(r.chips).toEqual([{ kind: "snippet", name: "deploy" }]);
  });

  it("handles multiple mixed blocks and trims the remaining text", () => {
    const input = [
      '<selection source="terminal">\nout\n</selection>',
      '<file name="a.txt">\nx\n</file>',
      '<snippet name="s1">\nbody\n</snippet>',
      "  what does this do?  ",
    ].join("\n");
    const r = stripUserContextBlocks(input);
    expect(r.text).toBe("what does this do?");
    expect(r.chips).toHaveLength(3);
    expect(r.chips.map((c) => c.kind)).toEqual([
      "selection",
      "file",
      "snippet",
    ]);
  });

  it("extracts several blocks of the same kind", () => {
    const r = stripUserContextBlocks(
      '<selection source="terminal">a</selection>' +
        '<selection source="editor">b\nc</selection>',
    );
    expect(r.chips).toEqual([
      { kind: "selection", source: "terminal", lines: 1 },
      { kind: "selection", source: "editor", lines: 2 },
    ]);
  });

  it("returns empty text when the message is only context blocks", () => {
    const r = stripUserContextBlocks('<file name="f.md">\nhi\n</file>');
    expect(r.text).toBe("");
    expect(r.chips).toEqual([{ kind: "file", name: "f.md", lines: 1 }]);
  });

  it("strips a grabbed page-element block (shown as its image, no chip)", () => {
    const r = stripUserContextBlocks(
      '<page-element name="Page element">\nSign in\n</page-element>\n\nwhat this?',
    );
    expect(r.text).toBe("what this?");
    expect(r.chips).toEqual([]);
  });
});
