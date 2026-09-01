// @vitest-environment jsdom
import "../testDependencies";
import type { Tab } from "../types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderRuntime } from "../testRuntime";
import type { HeaderRuntime, RigMeta } from "../types";
import { RigSwitcher } from "./RigSwitcher";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);
Element.prototype.setPointerCapture =
  Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture =
  Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView =
  Element.prototype.scrollIntoView ?? (() => {});

function meta(id: string, name: string): RigMeta {
  return {
    id,
    name,
    root: null,
    workspaceKind: "local",
  };
}

function term(id: number, rigId: string): Tab {
  return {
    id,
    kind: "terminal",
    rigId,
    title: "shell",
    label: "shell",
    dirty: false,
    preview: false,
    private: false,
    cwd: `/w/${id}`,
  };
}

const handlers = {
  onOpenChange: vi.fn(),
  onNewRig: vi.fn(),
  onNewSshRig: vi.fn(),
  onDeleteRig: vi.fn(),
  onNewTabInRig: vi.fn(),
  onJumpTab: vi.fn(),
  onCloseTab: vi.fn(),
  onMoveTabToRig: vi.fn(),
  onReorderTab: vi.fn(),
  onReorderRigs: vi.fn(),
};

let runtime: HeaderRuntime;

function mount(open = true, tabs: Tab[] = [term(1, "a"), term(2, "b")]) {
  return render(<RigSwitcher runtime={runtime} open={open} tabs={tabs} {...handlers} />);
}

function rigRow(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-rig-id="${id}"]`);
  if (!el) throw new Error(`rig row ${id} not rendered`);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createHeaderRuntime({
    rigs: [meta("a", "Alpha"), meta("b", "Beta")],
    activeRigId: "a",
    activateRig: vi.fn(),
    renameRig: vi.fn(),
  });
});

afterEach(cleanup);

describe("RigSwitcher", () => {
  it("renders nothing without an active rig", () => {
    runtime = createHeaderRuntime({ rigs: [], activeRigId: null });
    const { container } = mount(false);
    expect(container.innerHTML).toBe("");
  });

  it("renders the manage trigger with the shortcut", () => {
    mount(false);
    const trigger = screen.getByTitle(/Manage rigs/);
    expect(trigger.title).toContain("Ctrl K");
  });

  it("lists every rig and expands the active one", () => {
    mount();
    expect(rigRow("a").textContent).toContain("Alpha");
    expect(rigRow("b").textContent).toContain("Beta");
    // Active rig auto-expands, so its single tab row is visible.
    const tabRows = document.querySelectorAll('[data-drop="tab"]');
    expect(tabRows).toHaveLength(1);
    expect(tabRows[0].getAttribute("data-tab-id")).toBe("1");
  });

  it("switches rigs on a plain click and closes the popover", () => {
    mount();
    const row = rigRow("b");
    fireEvent.pointerDown(row, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(row, { pointerId: 1 });
    expect(runtime.activateRig).toHaveBeenCalledWith("b");
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates a rig from the footer chooser menu", async () => {
    mount();
    // The footer button opens a searchable chooser with a pinned local option.
    const trigger = screen.getByRole("button", { name: "New rig" });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("button", { name: /Local workspace/ }),
    );
    expect(handlers.onNewRig).toHaveBeenCalledTimes(1);
  });

  it("renames a rig inline through the store", () => {
    mount();
    fireEvent.click(
      rigRow("b").querySelector('[aria-label="Rename rig"]') as HTMLElement,
    );
    const input = document.querySelector(
      'input[aria-label="Rename rig"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Gamma" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(runtime.renameRig).toHaveBeenCalledWith("b", "Gamma");
  });

  it("ignores a rename that trims to nothing", () => {
    mount();
    fireEvent.click(
      rigRow("b").querySelector('[aria-label="Rename rig"]') as HTMLElement,
    );
    const input = document.querySelector(
      'input[aria-label="Rename rig"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(runtime.renameRig).not.toHaveBeenCalled();
  });

  it("delegates delete and new-tab to the callbacks", () => {
    mount();
    fireEvent.click(
      rigRow("b").querySelector('[aria-label="Delete rig"]') as HTMLElement,
    );
    expect(handlers.onDeleteRig).toHaveBeenCalledWith("b");
    fireEvent.click(
      rigRow("a").querySelector('[aria-label="New tab"]') as HTMLElement,
    );
    expect(handlers.onNewTabInRig).toHaveBeenCalledWith("a");
  });

  it("jumps to a tab from an expanded rig", () => {
    mount();
    const tabRow = document.querySelector('[data-drop="tab"]') as HTMLElement;
    fireEvent.keyDown(tabRow, { key: "Enter" });
    expect(handlers.onJumpTab).toHaveBeenCalledWith(1);
  });

  it("shows a floating chip while dragging a rig", () => {
    document.elementFromPoint = () => null;
    mount();
    const row = rigRow("b");
    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 30, clientY: 30 });
    const chips = Array.from(
      document.querySelectorAll(".pointer-events-none.fixed"),
    );
    expect(chips.some((c) => c.textContent === "Beta")).toBe(true);
    fireEvent.pointerUp(row, { pointerId: 1 });
    expect(
      Array.from(document.querySelectorAll(".pointer-events-none.fixed")).some(
        (c) => c.textContent === "Beta",
      ),
    ).toBe(false);
  });

  it("shows the tab chip while dragging a tab", () => {
    document.elementFromPoint = () => null;
    mount();
    const tabRow = document.querySelector('[data-drop="tab"]') as HTMLElement;
    fireEvent.pointerDown(tabRow, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(tabRow, { pointerId: 1, clientX: 30, clientY: 30 });
    const chips = Array.from(
      document.querySelectorAll(".pointer-events-none.fixed"),
    );
    expect(chips.some((c) => c.querySelector("svg"))).toBe(true);
    fireEvent.pointerUp(tabRow, { pointerId: 1 });
  });

  it("toggles a collapsed rig open to reveal its tabs", () => {
    mount();
    const chevron = rigRow("b").querySelector(
      '[aria-label="Expand"]',
    ) as HTMLElement;
    fireEvent.click(chevron);
    const tabRows = document.querySelectorAll('[data-drop="tab"]');
    expect(tabRows).toHaveLength(2);
  });
});
