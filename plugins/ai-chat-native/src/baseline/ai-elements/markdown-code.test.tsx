// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../store/chatStore", () => ({
  useChatStore: {
    getState: () => ({ live: { injectIntoActivePty: () => false } }),
  },
}));

import { MarkdownCode, markdownCodeText } from "./markdown-code";

afterEach(cleanup);

describe("markdownCodeText", () => {
  it("preserves text nested inside React children for HTML-wrapped code blocks", async () => {
    const React = await import("react");

    const text = markdownCodeText([
      "\n",
      React.createElement("span", { key: "a" }, 'const client = createClient("");'),
      "\n",
      React.createElement("span", { key: "b" }, 'await client.send({ id: "example" });'),
      "\n",
    ]);

    expect(text).toBe(
      '\nconst client = createClient("");\nawait client.send({ id: "example" });\n',
    );
  });

  it("stringifies numbers and drops null, undefined and booleans", () => {
    expect(markdownCodeText(42)).toBe("42");
    expect(markdownCodeText(null)).toBe("");
    expect(markdownCodeText(undefined)).toBe("");
    expect(markdownCodeText(true)).toBe("");
    expect(markdownCodeText([1, "a", false, null])).toBe("1a");
  });

  it("returns empty for non-element objects", () => {
    expect(markdownCodeText({} as never)).toBe("");
  });
});

describe("MarkdownCode", () => {
  it("renders inline code as a plain pill", () => {
    render(<MarkdownCode>inline snippet</MarkdownCode>);
    const el = screen.getByText("inline snippet");
    expect(el.tagName).toBe("CODE");
  });

  it("treats classNames without a language as inline", () => {
    render(<MarkdownCode className="whatever">still inline</MarkdownCode>);
    expect(screen.getByText("still inline").tagName).toBe("CODE");
  });

  it("delegates fenced blocks to the chat code renderer", () => {
    render(
      <MarkdownCode className="language-weirdlang">
        {"body text\n"}
      </MarkdownCode>,
    );
    expect(screen.getByText("weirdlang")).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
  });

  it("strips only the trailing newline from fenced code", () => {
    render(
      <MarkdownCode className="language-weirdlang">
        {"line one\nline two\n"}
      </MarkdownCode>,
    );
    const pre = screen.getByText((_, el) => el?.tagName === "PRE");
    expect(pre.textContent).toBe("line one\nline two");
  });
});
