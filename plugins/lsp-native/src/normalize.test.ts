import { describe, expect, it } from "vitest";
import {
  hoverToMarkdown,
  normalizeCompletion,
  normalizeDefinition,
} from "./normalize";
import { pathToUri, uriToPath } from "./uri";

describe("uri round-trips", () => {
  it("plain posix path", () => {
    expect(pathToUri("/a/b/c.ts")).toBe("file:///a/b/c.ts");
    expect(uriToPath("file:///a/b/c.ts")).toBe("/a/b/c.ts");
  });

  it("spaces and unicode percent-encode and decode", () => {
    const path = "/pro jekt/übung.ts";
    expect(uriToPath(pathToUri(path))).toBe(path);
    expect(pathToUri(path)).toContain("pro%20jekt");
  });

  it("windows drive letters", () => {
    expect(pathToUri("C:\\src\\a.ts")).toBe("file:///C:/src/a.ts");
    expect(uriToPath("file:///C:/src/a.ts")).toBe("C:/src/a.ts");
  });

  it("non-file uris pass through", () => {
    expect(uriToPath("untitled:Untitled-1")).toBe("untitled:Untitled-1");
  });
});

describe("normalizeDefinition", () => {
  const range = {
    start: { line: 3, character: 4 },
    end: { line: 3, character: 9 },
  };

  it("single Location", () => {
    expect(
      normalizeDefinition({ uri: "file:///a.ts", range }),
    ).toEqual([{ path: "/a.ts", line: 3, character: 4 }]);
  });

  it("Location[]", () => {
    expect(
      normalizeDefinition([
        { uri: "file:///a.ts", range },
        { uri: "file:///b.ts", range },
      ]),
    ).toHaveLength(2);
  });

  it("LocationLink[] prefers targetSelectionRange", () => {
    expect(
      normalizeDefinition([
        {
          targetUri: "file:///c.ts",
          targetRange: {
            start: { line: 0, character: 0 },
            end: { line: 9, character: 0 },
          },
          targetSelectionRange: range,
        },
      ]),
    ).toEqual([{ path: "/c.ts", line: 3, character: 4 }]);
  });

  it("null → empty", () => {
    expect(normalizeDefinition(null)).toEqual([]);
  });
});

describe("hoverToMarkdown", () => {
  it("MarkupContent passes through", () => {
    expect(
      hoverToMarkdown({ contents: { kind: "markdown", value: "**hi**" } }),
    ).toBe("**hi**");
  });

  it("MarkedString objects become fenced code", () => {
    expect(
      hoverToMarkdown({ contents: { language: "ts", value: "let x = 1" } }),
    ).toBe("```ts\nlet x = 1\n```");
  });

  it("arrays join with separators, empty parts dropped", () => {
    expect(
      hoverToMarkdown({ contents: ["a", "", { language: "ts", value: "b" }] }),
    ).toBe("a\n\n---\n\n```ts\nb\n```");
  });
});

describe("normalizeCompletion", () => {
  it("bare array → complete list", () => {
    const out = normalizeCompletion([{ label: "x" }]);
    expect(out).toEqual({ isIncomplete: false, items: [{ label: "x" }] });
  });

  it("folds itemDefaults into items", () => {
    const out = normalizeCompletion({
      isIncomplete: true,
      itemDefaults: {
        commitCharacters: ["."],
        insertTextFormat: 2,
        editRange: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 3 },
        },
      },
      items: [{ label: "foo", textEditText: "foo()" }],
    });
    expect(out.isIncomplete).toBe(true);
    expect(out.items[0]).toMatchObject({
      label: "foo",
      commitCharacters: ["."],
      insertTextFormat: 2,
      textEdit: {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 3 },
        },
        newText: "foo()",
      },
    });
  });

  it("item's own fields beat defaults", () => {
    const out = normalizeCompletion({
      isIncomplete: false,
      itemDefaults: { commitCharacters: ["."] },
      items: [{ label: "x", commitCharacters: ["("] }],
    });
    expect(out.items[0].commitCharacters).toEqual(["("]);
  });

  it("null → empty", () => {
    expect(normalizeCompletion(null)).toEqual({
      isIncomplete: false,
      items: [],
    });
  });
});
