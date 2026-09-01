// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

import { AiDiffPane } from "./AiDiffPane";

function renderPane(overrides: Partial<Parameters<typeof AiDiffPane>[0]> = {}) {
  const props = {
    path: "/ws/src/app.ts",
    originalContent: "line1\nline2\nline3\n",
    proposedContent: "line1\nLINE2\nline3\nline4\n",
    status: "pending" as const,
    isNewFile: false,
    onAccept: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
  render(<AiDiffPane {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe("AiDiffPane", () => {
  it("shows the path, status badge, and line stats", () => {
    renderPane();
    expect(screen.getByText("/ws/src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    // The minus sign in the tally is U+2212.
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("uses the established macOS /var alias for display without changing the source path", () => {
    const props = renderPane({ path: "/private/var/folders/fixture/workspace/notes.txt" });
    expect(screen.getByText("/var/folders/fixture/workspace/notes.txt")).toBeInTheDocument();
    expect(props.path).toBe("/private/var/folders/fixture/workspace/notes.txt");
  });

  it("renders accept and reject controls while pending", () => {
    const props = renderPane();
    screen.getByRole("button", { name: /Accept/ }).click();
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: /Reject/ }).click();
    expect(props.onReject).toHaveBeenCalledTimes(1);
  });

  it("hides the controls once applied", () => {
    renderPane({ status: "approved" });
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
  });

  it("shows the rejected badge", () => {
    renderPane({ status: "rejected" });
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("marks new files with a chip", () => {
    renderPane({ isNewFile: true, originalContent: "" });
    expect(screen.getByText("New file")).toBeInTheDocument();
  });

  it("does not show the new-file chip for edits", () => {
    renderPane();
    expect(screen.queryByText("New file")).toBeNull();
  });

  it("renders the proposed content in a read-only merge view", async () => {
    const { container } = render(
      <AiDiffPane
        path="/ws/read.ts"
        originalContent="const a = 1;\n"
        proposedContent="const a = 2;\n"
        status="pending"
        isNewFile={false}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    await waitFor(() => {
      // Two columns now: the current file on the left, the proposal on the
      // right — each with its own line-number gutter.
      const columns = [...container.querySelectorAll(".cm-content")];
      expect(columns).toHaveLength(2);
      expect(columns[0].textContent).toContain("const a = 1;");
      expect(columns[1].textContent).toContain("const a = 2;");
    });
    expect(container.querySelectorAll(".cm-lineNumbers")).toHaveLength(2);
    for (const c of container.querySelectorAll(".cm-content")) {
      expect(c.getAttribute("contenteditable")).toBe("false");
    }
  });
});
