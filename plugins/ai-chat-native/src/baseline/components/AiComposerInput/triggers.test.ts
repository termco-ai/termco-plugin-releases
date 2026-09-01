import { describe, expect, it } from "vitest";
import { detectFileTrigger, detectSnippetTrigger } from "./triggers";

describe("detectSnippetTrigger", () => {
  it("detects # at the start of the input", () => {
    expect(detectSnippetTrigger("#", 1)).toEqual({
      start: 0,
      end: 1,
      query: "",
      char: "#",
    });
  });

  it("detects / at the start of the input", () => {
    expect(detectSnippetTrigger("/", 1)).toEqual({
      start: 0,
      end: 1,
      query: "",
      char: "/",
    });
  });

  it("captures the query between the trigger and the caret", () => {
    expect(detectSnippetTrigger("#foo", 4)).toEqual({
      start: 0,
      end: 4,
      query: "foo",
      char: "#",
    });
  });

  it("lowercases the query", () => {
    expect(detectSnippetTrigger("#FooBar", 7)?.query).toBe("foobar");
  });

  it("allows digits and hyphens in the query", () => {
    expect(detectSnippetTrigger("#my-2nd", 7)?.query).toBe("my-2nd");
  });

  it("detects a trigger after whitespace mid-text", () => {
    expect(detectSnippetTrigger("run /pl", 7)).toEqual({
      start: 4,
      end: 7,
      query: "pl",
      char: "/",
    });
  });

  it("rejects a trigger glued to a preceding word", () => {
    expect(detectSnippetTrigger("a#foo", 5)).toBeNull();
    expect(detectSnippetTrigger("path/to", 7)).toBeNull();
  });

  it("rejects when the caret has whitespace between it and the trigger", () => {
    expect(detectSnippetTrigger("#foo bar", 8)).toBeNull();
  });

  it("rejects when a non-word char sits between trigger and caret", () => {
    expect(detectSnippetTrigger("#fo!o", 5)).toBeNull();
  });

  it("returns null when there is no trigger char before the caret", () => {
    expect(detectSnippetTrigger("hello", 5)).toBeNull();
    expect(detectSnippetTrigger("", 0)).toBeNull();
  });

  it("only scans up to the caret", () => {
    expect(detectSnippetTrigger("#foo", 2)).toEqual({
      start: 0,
      end: 2,
      query: "f",
      char: "#",
    });
  });
});

describe("detectFileTrigger", () => {
  it("detects @ at the start of the input", () => {
    expect(detectFileTrigger("@", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  it("captures a path-like query with slashes and dots", () => {
    expect(detectFileTrigger("@src/foo.ts", 11)).toEqual({
      start: 0,
      end: 11,
      query: "src/foo.ts",
    });
  });

  it("detects a trigger after whitespace mid-text", () => {
    expect(detectFileTrigger("open @rea", 9)).toEqual({
      start: 5,
      end: 9,
      query: "rea",
    });
  });

  it("rejects a trigger glued to a preceding word (emails)", () => {
    expect(detectFileTrigger("me@host", 7)).toBeNull();
  });

  it("rejects once whitespace separates the caret from the @", () => {
    expect(detectFileTrigger("@foo bar", 8)).toBeNull();
  });

  it("returns null when no @ precedes the caret", () => {
    expect(detectFileTrigger("hello", 5)).toBeNull();
    expect(detectFileTrigger("", 0)).toBeNull();
  });

  it("only scans up to the caret", () => {
    expect(detectFileTrigger("@abc", 2)).toEqual({
      start: 0,
      end: 2,
      query: "a",
    });
  });
});
