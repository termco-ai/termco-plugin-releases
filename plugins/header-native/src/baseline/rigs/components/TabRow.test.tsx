// @vitest-environment jsdom
import "../../testDependencies";
import type { Tab, TerminalTab } from "../../types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DropTarget } from "../types";
import { TabRow } from "./TabRow";

afterEach(cleanup);

function term(over: Partial<TerminalTab> = {}): Tab {
  return {
    id: 7,
    kind: "terminal",
    rigId: "s",
    title: "shell",
    label: "termco",
    dirty: false,
    preview: false,
    private: false,
    cwd: "/w/projects/termco",
    ...over,
  };
}

const callbacks = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onJump: vi.fn(),
  onClose: vi.fn(),
};

function mount(
  tab: Tab = term(),
  over: Partial<{
    dragging: { kind: "rig" | "tab"; id: string | number } | null;
    drop: DropTarget | null;
  }> = {},
) {
  return render(
    <TabRow
      tab={tab}
      dragging={over.dragging ?? null}
      drop={over.drop ?? null}
      {...callbacks}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("TabRow", () => {
  it("renders label, subtitle and drop metadata", () => {
    const { container } = mount();
    const row = container.querySelector('[data-drop="tab"]') as HTMLElement;
    expect(row.getAttribute("data-tab-id")).toBe("7");
    expect(row.textContent).toContain("termco");
    expect(row.textContent).toContain("projects/termco");
  });

  it("activates on Enter", () => {
    const { container } = mount();
    const row = container.querySelector('[data-drop="tab"]') as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(callbacks.onJump).toHaveBeenCalledTimes(1);
  });

  it("threads pointer gestures through the drag hook", () => {
    const { container } = mount();
    const row = container.querySelector('[data-drop="tab"]') as HTMLElement;
    fireEvent.pointerDown(row, { button: 0, pointerId: 1 });
    expect(callbacks.onPointerDown).toHaveBeenCalledWith(
      expect.anything(),
      "tab",
      7,
    );
    fireEvent.pointerMove(row, { pointerId: 1 });
    expect(callbacks.onPointerMove).toHaveBeenCalled();
    fireEvent.pointerUp(row, { pointerId: 1 });
    expect(callbacks.onPointerUp).toHaveBeenCalledWith(
      expect.anything(),
      callbacks.onJump,
    );
  });

  it("closes without activating", () => {
    const { getByLabelText } = mount();
    fireEvent.click(getByLabelText("Close tab"));
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onJump).not.toHaveBeenCalled();
  });

  it("dims while dragged and shows the drop line when targeted", () => {
    const { container } = mount(term(), {
      dragging: { kind: "tab", id: 7 },
      drop: { kind: "tab", tabId: 7, edge: "top" },
    });
    const row = container.querySelector('[data-drop="tab"]') as HTMLElement;
    expect(row.className).toContain("opacity-50");
    expect(container.querySelector(".bg-primary")).not.toBeNull();
  });

  it("shows no drop line for other targets", () => {
    const { container } = mount(term(), {
      dragging: { kind: "tab", id: 9 },
      drop: { kind: "tab", tabId: 9, edge: "top" },
    });
    expect(container.querySelector(".bg-primary")).toBeNull();
  });
});
