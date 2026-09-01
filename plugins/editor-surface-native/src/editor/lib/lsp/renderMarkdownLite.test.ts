// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { _clearJumpStack, popJump, pushJump } from "./jumpStack";
import { renderMarkdownLite } from "./renderMarkdownLite";

describe("renderMarkdownLite", () => {
  it("renders fenced code blocks with escaping", () => {
    const el = renderMarkdownLite("```ts\nconst a = 1 < 2;\n```");
    const pre = el.querySelector("pre.cm-lsp-code code");
    expect(pre?.textContent).toBe("const a = 1 < 2;");
    expect(el.innerHTML).toContain("&lt;");
  });

  it("renders inline code, bold, and headings", () => {
    const el = renderMarkdownLite("### Title\nUse `foo()` and **bar**");
    expect(el.querySelector(".cm-lsp-md-heading")?.textContent).toBe("Title");
    expect(el.querySelector("code")?.textContent).toBe("foo()");
    expect(el.querySelector("strong")?.textContent).toBe("bar");
  });

  it("neutralizes html in plain text (no injection)", () => {
    const el = renderMarkdownLite('<img src=x onerror="hack()">');
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img");
  });

  it("renders links as plain text spans", () => {
    const el = renderMarkdownLite("[docs](https://example.com)");
    expect(el.querySelector("a")).toBeNull();
    expect(el.querySelector(".cm-lsp-md-link")?.textContent).toBe("docs");
  });

  it("renders horizontal rules between sections", () => {
    const el = renderMarkdownLite("above\n\n---\n\nbelow");
    expect(el.querySelectorAll("hr")).toHaveLength(1);
    expect(el.querySelectorAll("p")).toHaveLength(2);
  });
});

describe("jumpStack", () => {
  it("is LIFO and capped", () => {
    _clearJumpStack();
    for (let i = 0; i < 60; i++) {
      pushJump({ path: `/f${i}.ts`, line: i, character: 0 });
    }
    expect(popJump()?.path).toBe("/f59.ts");
    let count = 1;
    while (popJump()) count++;
    expect(count).toBe(50);
    expect(popJump()).toBeNull();
  });
});
