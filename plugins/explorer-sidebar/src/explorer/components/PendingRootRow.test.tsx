// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingRootRow } from "./PendingRootRow";

afterEach(cleanup);

describe("PendingRootRow", () => {
  it("renders file and folder placeholders", () => {
    const first = render(
      <PendingRootRow kind="file" onCommit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText("New file")).toBeDefined();
    first.unmount();
    render(<PendingRootRow kind="dir" onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByPlaceholderText("New folder")).toBeDefined();
  });

  it("commits and cancels through the inline input", () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PendingRootRow kind="file" onCommit={onCommit} onCancel={onCancel} />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "root.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("root.ts");
  });
});
