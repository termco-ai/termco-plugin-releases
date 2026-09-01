// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModesView } from "./SearchModesView";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function setup(onPick = vi.fn()) {
  render(
    <Command>
      <CommandList>
        <SearchModesView onPick={onPick} />
      </CommandList>
    </Command>,
  );
  return onPick;
}

describe("SearchModesView", () => {
  it("lists the history and content sigils", () => {
    setup();
    expect(screen.getByText(">")).toBeDefined();
    expect(screen.getByText("#")).toBeDefined();
    expect(screen.getByText("Search command history")).toBeDefined();
    expect(screen.getByText("Find text in files")).toBeDefined();
  });

  it("picks the history sigil", () => {
    const onPick = setup();
    fireEvent.click(
      screen
        .getByText("Search command history")
        .closest("[cmdk-item]") as HTMLElement,
    );
    expect(onPick).toHaveBeenCalledWith(">");
  });

  it("picks the content sigil", () => {
    const onPick = setup();
    fireEvent.click(
      screen
        .getByText("Find text in files")
        .closest("[cmdk-item]") as HTMLElement,
    );
    expect(onPick).toHaveBeenCalledWith("#");
  });
});
