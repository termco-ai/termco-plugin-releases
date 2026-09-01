// biome-ignore-all lint/suspicious/noTemplateCurlyInString: LSP snippet syntax under test uses ${...} in plain strings
import { describe, expect, it } from "vitest";
import { lspSnippetToCm } from "./snippets";

describe("lspSnippetToCm", () => {
  it("passes plain text through", () => {
    expect(lspSnippetToCm("plain text")).toBe("plain text");
  });

  it("keeps numbered tabstops with placeholders", () => {
    expect(lspSnippetToCm("foo(${1:arg})")).toBe("foo(${1:arg})");
    expect(lspSnippetToCm("if ($1) { $2 }")).toBe("if (${1}) { ${2} }");
  });

  it("renumbers $0 past the highest tabstop (LSP exit point is last)", () => {
    expect(lspSnippetToCm("for (${1:i}) {\n\t$0\n}")).toBe(
      "for (${1:i}) {\n\t${2}\n}",
    );
    expect(lspSnippetToCm("a $0 b $3")).toBe("a ${4} b ${3}");
  });

  it("collapses choices to the first option", () => {
    expect(lspSnippetToCm("${1|public,private,protected|} x")).toBe(
      "${1:public} x",
    );
  });

  it("substitutes variables with their defaults or nothing", () => {
    expect(lspSnippetToCm("const $TM_FILENAME_BASE = 1;")).toBe("const  = 1;");
    expect(lspSnippetToCm("hello ${WORKSPACE_NAME:world}")).toBe("hello world");
    expect(lspSnippetToCm("x ${TM_SELECTED_TEXT/up/down/} y")).toBe("x  y");
  });

  it("handles nested placeholders", () => {
    expect(lspSnippetToCm("${1:outer ${2:inner}}")).toBe(
      "${1:outer ${2:inner}}",
    );
  });

  it("unescapes \\$ and friends", () => {
    expect(lspSnippetToCm("cost: \\$100")).toBe("cost: $100");
    expect(lspSnippetToCm("brace \\} here")).toBe("brace } here");
  });

  it("leaves stray dollars alone", () => {
    expect(lspSnippetToCm("a $ b")).toBe("a $ b");
    expect(lspSnippetToCm("price$")).toBe("price$");
  });
});
