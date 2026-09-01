// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewTabMenu } from "./NewTabMenu";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);

const handlers = {
  onNew: vi.fn(),
  onNewBlock: vi.fn(),
  onNewPrivate: vi.fn(),
  onNewPreview: vi.fn(),
  onNewEditor: vi.fn(),
  onNewGitGraph: vi.fn(),
};

function openMenu() {
  render(<NewTabMenu {...handlers} />);
  const trigger = screen.getByTitle("Open a new surface");
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
  fireEvent.click(trigger);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("NewTabMenu", () => {
  it("lists every tab kind", () => {
    openMenu();
    for (const label of [
      "Terminal",
      "Command blocks",
      "Private terminal",
      "Editor",
      "Web preview",
      "Git graph",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  const cases: Array<[string, keyof typeof handlers]> = [
    ["Terminal", "onNew"],
    ["Command blocks", "onNewBlock"],
    ["Private terminal", "onNewPrivate"],
    ["Editor", "onNewEditor"],
    ["Web preview", "onNewPreview"],
    ["Git graph", "onNewGitGraph"],
  ];

  for (const [label, handler] of cases) {
    it(`dispatches ${handler} for "${label}"`, () => {
      openMenu();
      fireEvent.click(screen.getByText(label));
      expect(handlers[handler]).toHaveBeenCalledTimes(1);
      for (const [, other] of cases) {
        if (other !== handler) {
          expect(handlers[other]).not.toHaveBeenCalled();
        }
      }
    });
  }
});
