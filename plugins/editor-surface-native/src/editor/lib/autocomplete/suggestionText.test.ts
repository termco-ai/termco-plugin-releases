import { describe, expect, it } from "vitest";
import { CACHE_HEAD, CACHE_TAIL, MAX_LINES } from "./constants";
import { suggestionKey, trimSuggestion } from "./suggestionText";

describe("suggestionKey", () => {
  it("combines language, prefix, and suffix", () => {
    expect(suggestionKey("abc", "def", "ts")).toBe("tsabc def");
    expect(suggestionKey("abc", "def", null)).toBe("abc def");
  });

  it("bounds the prefix to its tail and the suffix to its head", () => {
    const prefix = "p".repeat(CACHE_TAIL + 50);
    const suffix = "s".repeat(CACHE_HEAD + 50);
    const key = suggestionKey(prefix, suffix, null);
    expect(key).toBe(`${"p".repeat(CACHE_TAIL)} ${"s".repeat(CACHE_HEAD)}`);
  });

  it("keeps distant edits from changing the key", () => {
    const near = "x".repeat(CACHE_TAIL);
    expect(suggestionKey(`AAA${near}`, "", "ts")).toBe(
      suggestionKey(`BBB${near}`, "", "ts"),
    );
  });
});

describe("trimSuggestion", () => {
  it("returns empty for empty input", () => {
    expect(trimSuggestion("", "prefix", "")).toBe("");
  });

  it("strips wrapping markdown fences", () => {
    expect(trimSuggestion("```ts\nconst a = 1;\n```", "", "")).toBe(
      "const a = 1;",
    );
  });

  it("strips a leading cursor marker", () => {
    expect(trimSuggestion("<|cursor|>done()", "", "")).toBe("done()");
  });

  it("removes prefix-tail overlap for a partially typed token", () => {
    expect(trimSuggestion("test", "#[te", "]")).toBe("st");
  });

  it("removes the longest matching prefix overlap", () => {
    expect(trimSuggestion("hello()", "const hello", "")).toBe("()");
  });

  it("caps the suggestion at MAX_LINES", () => {
    const raw = Array.from({ length: MAX_LINES + 4 }, (_, i) => `l${i}`).join(
      "\n",
    );
    const result = trimSuggestion(raw, "", "");
    expect(result.split("\n")).toHaveLength(MAX_LINES);
  });

  it("drops trailing overlap with the suffix", () => {
    expect(trimSuggestion("a + b;", "const x = ", ";")).toBe("a + b");
  });

  it("strips leading indent already typed on the current line", () => {
    expect(trimSuggestion("  return 1;", "function f() {\n  ", "\n}")).toBe(
      "return 1;",
    );
  });

  it("returns empty when the suggestion duplicates the typed line", () => {
    expect(trimSuggestion("const a = 1;", "const a = 1;", "")).toBe("");
  });

  it("trims trailing whitespace", () => {
    expect(trimSuggestion("done()  \n", "", "")).toBe("done()");
  });

  it("prepends a newline after an opening delimiter for a body", () => {
    expect(trimSuggestion("  return x;", "function f(x) {", "\n}")).toBe(
      "\n  return x;",
    );
  });

  it("prepends a newline after an arrow for a multi-line body", () => {
    const result = trimSuggestion("a\nb", "const f = () => ", "");
    expect(result.startsWith("\n")).toBe(true);
  });

  it("does not prepend a newline for a same-line completion", () => {
    expect(trimSuggestion("a + b", "const sum = (a, b) => ", ";")).toBe(
      "a + b",
    );
  });
});
