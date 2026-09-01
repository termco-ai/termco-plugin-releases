import { describe, expect, it } from "vitest";

import {
  highlight,
  isHighlightable,
  type HighlightedNode,
} from "./chat-code-lezer";

function joined(nodes: HighlightedNode[]): string {
  return nodes
    .map((n) => (n.kind === "break" ? "\n" : n.value))
    .join("");
}

describe("isHighlightable", () => {
  it("accepts Lezer-backed languages", () => {
    expect(isHighlightable("ts")).toBe(true);
    expect(isHighlightable("rust")).toBe(true);
    expect(isHighlightable("json")).toBe(true);
  });

  it("accepts stream-mode languages", () => {
    expect(isHighlightable("yaml")).toBe(true);
    expect(isHighlightable("c")).toBe(true);
    expect(isHighlightable("dockerfile")).toBe(true);
  });

  it("resolves aliases case-insensitively", () => {
    expect(isHighlightable("JavaScript")).toBe(true);
    expect(isHighlightable("py")).toBe(true);
    expect(isHighlightable("C++")).toBe(true);
    expect(isHighlightable("yml")).toBe(true);
    expect(isHighlightable("h")).toBe(true);
    expect(isHighlightable("patch")).toBe(true);
  });

  it("rejects unknown or empty languages", () => {
    expect(isHighlightable(null)).toBe(false);
    expect(isHighlightable(undefined)).toBe(false);
    expect(isHighlightable("")).toBe(false);
    expect(isHighlightable("bash")).toBe(false);
    expect(isHighlightable("made-up")).toBe(false);
  });
});

describe("highlight (lezer path)", () => {
  it("returns null for unresolvable languages", async () => {
    expect(await highlight("x", "made-up")).toBeNull();
  });

  it("tokenizes TypeScript and round-trips the source", async () => {
    const code = 'const x = 1;\nlet s = "hi";';
    const nodes = await highlight(code, "ts");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
    const classes = nodes!
      .filter((n) => n.kind === "text")
      .map((n) => (n as { cls: string }).cls);
    expect(classes.some((c) => c.includes("tok-keyword"))).toBe(true);
    expect(classes.some((c) => c.includes("tok-string"))).toBe(true);
    expect(nodes!.some((n) => n.kind === "break")).toBe(true);
  });

  it("caches loaded languages across calls", async () => {
    const first = await highlight("const a = 1;", "ts");
    const second = await highlight("const b = 2;", "ts");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(joined(second!)).toBe("const b = 2;");
  });

  it("handles bare PHP via the plain variant", async () => {
    const code = "echo 1;";
    const nodes = await highlight(code, "php");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
  });
});

describe("highlight loader table", () => {
  const lezerLangs = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "rust",
    "go",
    "python",
    "json",
    "html",
    "css",
    "markdown",
    "php",
  ];
  const streamLangs = [
    "c",
    "cpp",
    "java",
    "csharp",
    "kotlin",
    "scala",
    "objectivec",
    "dart",
    "yaml",
    "toml",
    "ruby",
    "swift",
    "lua",
    "haskell",
    "perl",
    "r",
    "dockerfile",
    "nginx",
    "diff",
  ];

  it.each(lezerLangs)("loads the %s lezer parser", async (lang) => {
    const code = "value = 1";
    const nodes = await highlight(code, lang);
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
  });

  it.each(streamLangs)("loads the %s stream parser", async (lang) => {
    const code = "value = 1";
    const nodes = await highlight(code, lang);
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
  });
});

describe("highlight (stream path)", () => {
  it("tokenizes yaml lines with breaks and blank lines", async () => {
    const code = "key: value\n\nother: 42";
    const nodes = await highlight(code, "yaml");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
    expect(nodes!.filter((n) => n.kind === "break")).toHaveLength(2);
  });

  it("maps legacy token names to tok-* classes", async () => {
    const code = 'int main() { return "s"; } // done';
    const nodes = await highlight(code, "c");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
    const classes = nodes!
      .filter((n) => n.kind === "text")
      .map((n) => (n as { cls: string }).cls);
    expect(classes.some((c) => c.includes("tok-typeName"))).toBe(true);
    expect(classes.some((c) => c.includes("tok-string"))).toBe(true);
    expect(classes.some((c) => c.includes("tok-comment"))).toBe(true);
    expect(classes.some((c) => c.includes("tok-definition"))).toBe(true);
  });

  it("resolves the diff alias and keeps unstyled text empty-class", async () => {
    const code = "+added line\n-removed line\ncontext";
    const nodes = await highlight(code, "patch");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
  });

  it("caches stream parsers across calls", async () => {
    const first = await highlight("a: 1", "yml");
    const second = await highlight("b: 2", "yml");
    expect(joined(first!)).toBe("a: 1");
    expect(joined(second!)).toBe("b: 2");
  });

  it("handles ruby via the alias table", async () => {
    const code = "def hello\n  puts 'hi'\nend";
    const nodes = await highlight(code, "rb");
    expect(nodes).not.toBeNull();
    expect(joined(nodes!)).toBe(code);
  });
});
