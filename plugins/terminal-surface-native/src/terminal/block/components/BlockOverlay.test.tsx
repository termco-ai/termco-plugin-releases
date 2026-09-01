// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findInBlock } from "../lib/blockEvents";
import { BlockOverlay } from "./BlockOverlay";

vi.mock("./BlockSearchBar", () => ({
  SearchBar: ({
    blockId,
    onClose,
  }: {
    blockId: string;
    onClose: () => void;
  }) => (
    <div data-testid="searchbar">
      searching {blockId}
      <button type="button" data-testid="close-search" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

function renderOverlay(leafId = 7) {
  const clearSearch = vi.fn();
  render(
    <BlockOverlay
      leafId={leafId}
      subscribe={vi.fn(() => () => {})}
      searchBlock={vi.fn(() => [])}
      revealMatch={vi.fn()}
      clearSearch={clearSearch}
    />,
  );
  return { clearSearch };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockOverlay", () => {
  it("renders nothing until a find event arrives", () => {
    renderOverlay();
    expect(screen.queryByTestId("searchbar")).not.toBeInTheDocument();
  });

  it("opens the search bar for its own leaf", () => {
    renderOverlay(7);
    act(() => findInBlock(7, "b3"));
    expect(screen.getByTestId("searchbar")).toHaveTextContent("searching b3");
  });

  it("ignores find events for other leaves", () => {
    renderOverlay(7);
    act(() => findInBlock(8, "b3"));
    expect(screen.queryByTestId("searchbar")).not.toBeInTheDocument();
  });

  it("closing clears the search highlight", () => {
    const { clearSearch } = renderOverlay(7);
    act(() => findInBlock(7, "b1"));
    fireEvent.click(screen.getByTestId("close-search"));
    expect(clearSearch).toHaveBeenCalled();
    expect(screen.queryByTestId("searchbar")).not.toBeInTheDocument();
  });
});
