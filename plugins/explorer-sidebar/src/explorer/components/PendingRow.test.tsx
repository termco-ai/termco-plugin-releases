// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingRow } from "./PendingRow";

afterEach(cleanup);

describe("PendingRow", () => {
  it("renders a file placeholder", () => {
    render(
      <PendingRow
        depth={1}
        kind="file"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("New file")).toBeDefined();
  });

  it("renders a folder placeholder", () => {
    render(
      <PendingRow depth={1} kind="dir" onCommit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText("New folder")).toBeDefined();
  });

  it("commits the typed name on Enter", () => {
    const onCommit = vi.fn();
    render(
      <PendingRow
        depth={0}
        kind="file"
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "new.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("new.ts");
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <PendingRow
        depth={0}
        kind="dir"
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("indents by depth", () => {
    const { container } = render(
      <PendingRow
        depth={3}
        kind="file"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.style.paddingLeft).toBe("42px");
  });
});
