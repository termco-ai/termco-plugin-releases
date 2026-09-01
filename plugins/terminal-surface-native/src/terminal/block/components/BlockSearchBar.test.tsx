// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockMatch } from "../lib/blockDecorations";
import { SearchBar } from "./BlockSearchBar";

function match(line: number): BlockMatch {
  return { line, start: 0, end: 3 } as unknown as BlockMatch;
}

const searchBlock = vi.fn<(id: string, query: string) => BlockMatch[]>(() => []);
const revealMatch = vi.fn();
const clearSearch = vi.fn();
const onClose = vi.fn();

function mount() {
  return render(
    <SearchBar
      blockId="b1"
      searchBlock={searchBlock}
      revealMatch={revealMatch}
      clearSearch={clearSearch}
      onClose={onClose}
    />,
  );
}

function input(): HTMLInputElement {
  return screen.getByPlaceholderText("Find in block");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("SearchBar", () => {
  it("focuses the input on mount and shows a zero count", () => {
    mount();
    expect(document.activeElement).toBe(input());
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("searches on input and reveals the first match", () => {
    const matches = [match(1), match(2), match(3)];
    searchBlock.mockReturnValue(matches);
    mount();
    fireEvent.change(input(), { target: { value: "err" } });
    expect(searchBlock).toHaveBeenCalledWith("b1", "err");
    expect(revealMatch).toHaveBeenCalledWith(matches[0]);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("clears the previous highlight when there are no matches", () => {
    searchBlock.mockReturnValue([]);
    mount();
    fireEvent.change(input(), { target: { value: "zzz" } });
    expect(revealMatch).not.toHaveBeenCalled();
    expect(clearSearch).toHaveBeenCalled();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("cycles forward with Enter and wraps around", () => {
    const matches = [match(1), match(2)];
    searchBlock.mockReturnValue(matches);
    mount();
    fireEvent.change(input(), { target: { value: "x" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(revealMatch).toHaveBeenLastCalledWith(matches[1]);
    expect(screen.getByText("2/2")).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(revealMatch).toHaveBeenLastCalledWith(matches[0]);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("cycles backward with Shift+Enter", () => {
    const matches = [match(1), match(2), match(3)];
    searchBlock.mockReturnValue(matches);
    mount();
    fireEvent.change(input(), { target: { value: "x" } });
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    expect(revealMatch).toHaveBeenLastCalledWith(matches[2]);
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("navigates with the arrow buttons", () => {
    const matches = [match(1), match(2)];
    searchBlock.mockReturnValue(matches);
    mount();
    fireEvent.change(input(), { target: { value: "x" } });
    fireEvent.click(screen.getByTitle("Next"));
    expect(revealMatch).toHaveBeenLastCalledWith(matches[1]);
    fireEvent.click(screen.getByTitle("Previous"));
    expect(revealMatch).toHaveBeenLastCalledWith(matches[0]);
  });

  it("ignores navigation without matches", () => {
    mount();
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.click(screen.getByTitle("Next"));
    expect(revealMatch).not.toHaveBeenCalled();
  });

  it("closes on Escape and via the close button", () => {
    mount();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
