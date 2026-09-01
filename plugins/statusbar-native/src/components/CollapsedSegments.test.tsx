// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollapsedSegments } from "./CollapsedSegments";

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

const segments = [
  { fullPath: "/Users/dev", label: "~", isHome: true },
  { fullPath: "/Users/dev/repo", label: "repo", isHome: false },
];

function openMenu() {
  const trigger = screen.getByTitle("Show hidden folders");
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

describe("CollapsedSegments", () => {
  it("lists collapsed folders and navigates to the picked path", async () => {
    const onCd = vi.fn();
    render(<CollapsedSegments segments={segments} onCd={onCd} />);
    expect(screen.queryByText("repo")).toBeNull();
    openMenu();
    expect(await screen.findByText("Home")).toBeDefined();
    const item = screen.getByText("repo");
    fireEvent.click(item.closest("[role=menuitem]") as HTMLElement);
    expect(onCd).toHaveBeenCalledWith("/Users/dev/repo");
  });
});
