// Kept with the source-owning terminal plugin.
import { describe, expect, it } from "vitest";
import { stripAnsi } from "./ansiStrip";

describe("stripAnsi", () => {
  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips CSI color sequences", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m plain")).toBe("red plain");
  });

  it("strips CSI sequences with parameters and private markers", () => {
    expect(stripAnsi("\x1b[?25htext\x1b[1;32;40m")).toBe("text");
  });

  it("strips OSC sequences terminated by BEL", () => {
    expect(stripAnsi("\x1b]0;window title\x07body")).toBe("body");
  });

  it("strips OSC sequences terminated by ST", () => {
    expect(stripAnsi("\x1b]7;file:///home\x1b\\body")).toBe("body");
  });

  it("strips charset designation sequences", () => {
    expect(stripAnsi("\x1b(Btext\x1b(0")).toBe("text");
  });

  it("strips cursor save/restore and keypad mode escapes", () => {
    expect(stripAnsi("\x1b7a\x1b8b\x1b=c\x1b>d")).toBe("abcd");
  });

  it("strips full reset", () => {
    expect(stripAnsi("\x1bcfresh")).toBe("fresh");
  });

  it("handles multiple sequences interleaved with text", () => {
    const input = "\x1b[1mA\x1b[0m \x1b]0;t\x07B \x1b[2K\x1b[HC";
    expect(stripAnsi(input)).toBe("A B C");
  });

  it("keeps empty string empty", () => {
    expect(stripAnsi("")).toBe("");
  });
});
