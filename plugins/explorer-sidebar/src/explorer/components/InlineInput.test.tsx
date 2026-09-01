// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineInput } from "./InlineInput";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(initial = "", placeholder?: string) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineInput
      initial={initial}
      placeholder={placeholder}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const input = screen.getByRole<HTMLInputElement>("textbox");
  return { input, onCommit, onCancel };
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe("InlineInput", () => {
  it("focuses itself and selects the name up to the extension", () => {
    const { input } = setup("readme.md");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("readme".length);
  });

  it("selects everything when there is no extension", () => {
    const { input } = setup("Makefile");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Makefile".length);
  });

  it("selects everything for dotfiles", () => {
    const { input } = setup(".gitignore");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(".gitignore".length);
  });

  it("commits the typed value on Enter exactly once", () => {
    const { input, onCommit } = setup("a.ts");
    settle();
    fireEvent.change(input, { target: { value: "b.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("b.ts");
  });

  it("cancels on Escape without committing", () => {
    const { input, onCommit, onCancel } = setup("a.ts");
    settle();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("refocuses instead of committing when blurred before it settles", () => {
    const { input, onCommit } = setup("a.ts");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("commits on blur once settled", () => {
    const { input, onCommit } = setup("a.ts");
    settle();
    fireEvent.change(input, { target: { value: "renamed.ts" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("renamed.ts");
  });

  it("renders the placeholder", () => {
    setup("", "New file");
    expect(
      screen.getByPlaceholderText<HTMLInputElement>("New file"),
    ).toBeDefined();
  });
});
