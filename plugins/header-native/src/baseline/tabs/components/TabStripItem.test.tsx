// @vitest-environment jsdom
import "../../testDependencies";
import { Tabs, TabsList } from "../../ui";
import { TooltipProvider } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragState } from "../lib/dragState";
import type { EditorTab, Tab, TerminalTab } from "../../types";
import { TabStripItem } from "./TabStripItem";

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

function terminal(over: Partial<TerminalTab> = {}): Tab {
  return {
    id: 1,
    kind: "terminal",
    rigId: "s",
    title: "shell",
    label: "proj",
    dirty: false,
    preview: false,
    private: false,
    cwd: "/w/proj",
    ...over,
  };
}

function editor(over: Partial<EditorTab> = {}): Tab {
  return {
    id: 2,
    kind: "editor",
    rigId: "s",
    title: "foo.ts",
    label: "foo.ts",
    path: "/a/foo.ts",
    dirty: false,
    preview: false,
    private: false,
    ...over,
  };
}

const callbacks = {
  setEditingId: vi.fn(),
  setDraggingId: vi.fn(),
  setDropGap: vi.fn(),
  gapAtX: vi.fn(() => 2),
  endDrag: vi.fn(),
  setShowAllLanguages: vi.fn(),
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onCloseMany: vi.fn(),
  onNewTabRight: vi.fn(),
  onDuplicate: vi.fn(),
  onPin: vi.fn(),
  onRename: vi.fn(),
  onReorder: vi.fn(),
  onOverrideLanguage: vi.fn(),
};

let dragRef: { current: DragState | null };

type Overrides = Partial<
  Pick<
    Parameters<typeof TabStripItem>[0],
    | "index"
    | "tabCount"
    | "activeId"
    | "isNew"
    | "compact"
    | "srcIndex"
    | "draggingId"
    | "dropGap"
    | "editingId"
    | "showAllLanguages"
  >
>;

function mount(tab: Tab, over: Overrides = {}) {
  const props = {
    tab,
    index: 0,
    tabCount: 2,
    activeId: 1,
    isNew: false,
    srcIndex: -1,
    draggingId: null,
    dropGap: null,
    editingId: null,
    dragRef,
    showAllLanguages: false,
    ...callbacks,
    ...over,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TooltipProvider>
      <Tabs value={String(props.activeId)}>
        <TabsList>{children}</TabsList>
      </Tabs>
    </TooltipProvider>
  );
  return render(<TabStripItem {...props} />, { wrapper });
}

function tabEl(id: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
  if (!el) throw new Error(`tab ${id} not rendered`);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  dragRef = { current: null };
});

afterEach(cleanup);

describe("rendering", () => {
  it("shows the label and marks the active tab", () => {
    mount(terminal());
    const el = tabEl(1);
    expect(el.textContent).toContain("proj");
    expect(el.getAttribute("data-tab-active")).toBe("true");
  });

  it("does not mark inactive tabs", () => {
    mount(terminal({ id: 5 }), { activeId: 1 });
    expect(tabEl(5).getAttribute("data-tab-active")).toBeNull();
  });

  it("italicizes preview editor tabs and shows the dirty dot", () => {
    mount(editor({ preview: true }));
    const label = tabEl(2).querySelector(".italic");
    expect(label?.textContent).toBe("foo.ts");
    cleanup();
    mount(editor({ dirty: true }));
    expect(
      tabEl(2).querySelector('[aria-label="Unsaved changes"]'),
    ).not.toBeNull();
  });

  it("shows the close button even for a lone tab (empty is allowed)", () => {
    mount(terminal(), { tabCount: 1 });
    expect(screen.getByLabelText("Close tab")).toBeTruthy();
  });
});

describe("activation and closing", () => {
  it("selects on a plain press-and-release", () => {
    mount(terminal());
    const el = tabEl(1);
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 10 });
    expect(callbacks.onSelect).toHaveBeenCalledWith(1);
    expect(callbacks.onReorder).not.toHaveBeenCalled();
    expect(callbacks.endDrag).toHaveBeenCalled();
  });

  it("closes via the close button without selecting", () => {
    mount(terminal());
    fireEvent.click(screen.getByLabelText("Close tab"));
    expect(callbacks.onClose).toHaveBeenCalledWith(1);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("editor tabs expose the Chrome-style close-variant context menu", () => {
    // index 1 of 3 → both left and right neighbours exist.
    mount(editor(), { index: 1, tabCount: 3 });
    fireEvent.contextMenu(tabEl(2));
    fireEvent.click(screen.getByText("Close to the Right"));
    expect(callbacks.onCloseMany).toHaveBeenCalledWith(2, "right");
  });

  it("disables 'Close to the Right' for the last tab", () => {
    mount(editor(), { index: 2, tabCount: 3 }); // no tabs to the right
    fireEvent.contextMenu(tabEl(2));
    fireEvent.click(screen.getByText("Close to the Right"));
    // Disabled item does not fire its action.
    expect(callbacks.onCloseMany).not.toHaveBeenCalled();
  });

  it("closes on middle click when other tabs remain", () => {
    mount(terminal());
    fireEvent(
      tabEl(1),
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 1,
      }),
    );
    expect(callbacks.onClose).toHaveBeenCalledWith(1);
  });

  it("closes on middle click even on the last tab (empty is allowed)", () => {
    mount(terminal(), { tabCount: 1 });
    fireEvent(
      tabEl(1),
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 1,
      }),
    );
    expect(callbacks.onClose).toHaveBeenCalledWith(1);
  });

  it("pins a preview tab on double click", () => {
    mount(editor({ preview: true }));
    fireEvent.doubleClick(tabEl(2));
    expect(callbacks.onPin).toHaveBeenCalledWith(2);
  });

  it("does not pin persistent tabs on double click", () => {
    mount(editor());
    fireEvent.doubleClick(tabEl(2));
    expect(callbacks.onPin).not.toHaveBeenCalled();
  });
});

describe("drag gesture", () => {
  it("activates the drag past the threshold and reports the gap", () => {
    mount(terminal(), { dropGap: 2 });
    const el = tabEl(1);
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0 });
    expect(dragRef.current).toMatchObject({ fromId: 1, active: false });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 10 });
    expect(dragRef.current?.active).toBe(true);
    expect(callbacks.setDraggingId).toHaveBeenCalledWith(1);
    expect(callbacks.setDropGap).toHaveBeenCalledWith(2);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 10 });
    expect(callbacks.onReorder).toHaveBeenCalledWith(1, 2);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("keeps the drag inert under the threshold", () => {
    mount(terminal());
    const el = tabEl(1);
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 2 });
    expect(dragRef.current?.active).toBe(false);
    expect(callbacks.setDraggingId).not.toHaveBeenCalled();
  });

  it("never starts a drag from the close button", () => {
    mount(terminal());
    fireEvent.pointerDown(screen.getByLabelText("Close tab"), {
      button: 0,
      pointerId: 1,
    });
    expect(dragRef.current).toBeNull();
  });

  it("shows drop indicators around foreign gaps only", () => {
    const { container } = mount(terminal(), {
      draggingId: 99,
      dropGap: 0,
      srcIndex: 5,
    });
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
    cleanup();
    const { container: own } = mount(terminal(), {
      draggingId: 1,
      dropGap: 0,
      srcIndex: 0,
    });
    expect(own.querySelectorAll(".bg-primary")).toHaveLength(0);
  });
});

describe("rename flow", () => {
  it("renders the rename cell while editing", () => {
    mount(terminal(), { editingId: 1 });
    expect(screen.getByLabelText("Rename tab")).toBeTruthy();
    expect(document.querySelector('[data-tab-active="true"]')).toBeNull();
  });

  it("commits a rename and leaves edit mode", () => {
    mount(terminal(), { editingId: 1 });
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "Server" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(callbacks.onRename).toHaveBeenCalledWith(1, "Server");
    expect(callbacks.setEditingId).toHaveBeenCalledWith(null);
  });

  it("cancels a rename on Escape", () => {
    mount(terminal(), { editingId: 1 });
    fireEvent.keyDown(screen.getByLabelText("Rename tab"), { key: "Escape" });
    expect(callbacks.onRename).not.toHaveBeenCalled();
    expect(callbacks.setEditingId).toHaveBeenCalledWith(null);
  });

  it("opens the context menu with a rename entry for terminals", () => {
    mount(terminal());
    fireEvent.contextMenu(tabEl(1));
    fireEvent.click(screen.getByText("Rename"));
    expect(callbacks.setEditingId).toHaveBeenCalledWith(1);
  });

  it("offers close in the context menu when other tabs remain", () => {
    mount(terminal());
    fireEvent.contextMenu(tabEl(1));
    fireEvent.click(screen.getByText("Close"));
    expect(callbacks.onClose).toHaveBeenCalledWith(1);
  });
});
