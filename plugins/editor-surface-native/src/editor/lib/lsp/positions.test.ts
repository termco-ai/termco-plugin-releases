import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  contentChecksum,
  lspRangeToCm,
  lspToOffset,
  offsetToLsp,
} from "./positions";

const doc = Text.of(["const x = 1;", "let y = x;", ""]);

describe("offsetToLsp / lspToOffset", () => {
  it("round-trips interior positions", () => {
    const offset = doc.line(2).from + 4; // "let |y = x;"
    const pos = offsetToLsp(doc, offset);
    expect(pos).toEqual({ line: 1, character: 4 });
    expect(lspToOffset(doc, pos)).toBe(offset);
  });

  it("clamps out-of-range input offsets", () => {
    expect(offsetToLsp(doc, -5)).toEqual({ line: 0, character: 0 });
    expect(offsetToLsp(doc, 9999).line).toBe(2);
  });

  it("clamps out-of-range LSP positions", () => {
    expect(lspToOffset(doc, { line: 99, character: 0 })).toBe(doc.length);
    expect(lspToOffset(doc, { line: 0, character: 999 })).toBe(doc.line(1).to);
    expect(lspToOffset(doc, { line: 0, character: -3 })).toBe(0);
  });

  it("uses UTF-16 units for astral characters", () => {
    const emoji = Text.of(["a😀b"]);
    // 😀 is a surrogate pair: "b" sits at character 3
    expect(lspToOffset(emoji, { line: 0, character: 3 })).toBe(3);
    expect(offsetToLsp(emoji, 3)).toEqual({ line: 0, character: 3 });
  });
});

describe("lspRangeToCm", () => {
  it("maps ranges and never inverts them", () => {
    const range = lspRangeToCm(doc, {
      start: { line: 0, character: 6 },
      end: { line: 0, character: 7 },
    });
    expect(range).toEqual({ from: 6, to: 7 });
    const inverted = lspRangeToCm(doc, {
      start: { line: 1, character: 5 },
      end: { line: 0, character: 0 },
    });
    expect(inverted.to).toBeGreaterThanOrEqual(inverted.from);
  });
});

describe("contentChecksum", () => {
  it("is stable and content-sensitive (must match main's djb2)", () => {
    expect(contentChecksum("hello")).toBe(contentChecksum("hello"));
    expect(contentChecksum("hello")).not.toBe(contentChecksum("hello!"));
    // Pinned value so renderer and main implementations can't drift silently.
    expect(contentChecksum("abc")).toBe(193485963);
  });
});
