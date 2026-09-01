// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Theme extension pulls the preferences/theme stack; the viewer only needs a
// no-op extension here.
vi.mock("../lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

import { LogView, type LogViewHandle } from "./LogView";

afterEach(cleanup);

const LOG = "line one\nline two\nline three";

describe("LogView", () => {
  it("renders the text in a CodeMirror view", async () => {
    const { container } = render(<LogView text={LOG} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")?.textContent).toContain(
        "line two",
      );
    });
  });

  it("shows a line-number gutter like the file editor", async () => {
    const { container } = render(<LogView text={LOG} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
    });
    const nums = Array.from(
      container.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ).map((n) => n.textContent);
    // 1..3 present (plus a leading spacer element).
    expect(nums).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });

  it("is read-only (not editable)", async () => {
    const { container } = render(<LogView text={LOG} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")).not.toBeNull();
    });
    expect(
      container.querySelector(".cm-content")?.getAttribute("contenteditable"),
    ).toBe("false");
  });

  it("toggles soft-wrap via the wrap prop", async () => {
    const { container, rerender } = render(<LogView text={LOG} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")).not.toBeNull();
    });
    expect(container.querySelector(".cm-lineWrapping")).toBeNull();
    rerender(<LogView text={LOG} wrap />);
    await waitFor(() => {
      expect(container.querySelector(".cm-lineWrapping")).not.toBeNull();
    });
  });

  it("opens the find panel through the imperative handle", async () => {
    const ref = createRef<LogViewHandle>();
    const { container } = render(<LogView ref={ref} text={LOG} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")).not.toBeNull();
    });
    expect(container.querySelector(".cm-search")).toBeNull();
    ref.current?.openSearch();
    await waitFor(() => {
      expect(container.querySelector(".cm-search")).not.toBeNull();
    });
    // The search panel exposes a query input — text is searchable.
    expect(
      container.querySelector(".cm-search [main-field], .cm-search input"),
    ).not.toBeNull();
  });

  it("scrollToBottom is safe to call", async () => {
    const ref = createRef<LogViewHandle>();
    const { container } = render(<LogView ref={ref} text={LOG} follow />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")).not.toBeNull();
    });
    expect(() => ref.current?.scrollToBottom()).not.toThrow();
  });
});
