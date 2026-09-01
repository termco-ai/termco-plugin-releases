// @vitest-environment jsdom
import "../testDependencies";
import { TooltipProvider } from "../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../types";
import { TabBar } from "./TabBar";

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

const tabs: Tab[] = [
  {
    id: 1,
    kind: "terminal",
    rigId: "s",
    title: "shell",
    label: "proj",
    dirty: false,
    preview: false,
    private: false,
    cwd: "/w/proj",
  },
  {
    id: 2,
    kind: "editor",
    rigId: "s",
    title: "foo.ts",
    label: "foo.ts",
    path: "/a/foo.ts",
    dirty: false,
    preview: false,
    private: false,
  },
  {
    id: 3,
    kind: "preview",
    rigId: "s",
    title: "localhost:5173",
    label: "localhost:5173",
    dirty: false,
    preview: false,
    private: false,
  },
];

const handlers = {
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onNewBlock: vi.fn(),
  onNewPrivate: vi.fn(),
  onNewPreview: vi.fn(),
  onNewEditor: vi.fn(),
  onNewGitGraph: vi.fn(),
  onClose: vi.fn(),
  onCloseMany: vi.fn(),
  onNewTabRight: vi.fn(),
  onDuplicate: vi.fn(),
  onPin: vi.fn(),
  onRename: vi.fn(),
  onReorder: vi.fn(),
  onSplit: vi.fn(),
  onOverrideLanguage: vi.fn(),
};

function mount(activeId = 1, list = tabs) {
  return render(<TabBar tabs={list} activeId={activeId} {...handlers} />, {
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TabBar", () => {
  it("renders one strip item per tab with the active one marked", () => {
    const { container } = mount(2);
    const items = container.querySelectorAll("[data-tab-id]");
    expect(items).toHaveLength(3);
    expect(
      container
        .querySelector('[data-tab-active="true"]')
        ?.getAttribute("data-tab-id"),
    ).toBe("2");
  });

  it("shows cwd-derived labels for terminals and titles for the rest", () => {
    const { container } = mount();
    const text = container.textContent ?? "";
    expect(text).toContain("proj");
    expect(text).toContain("foo.ts");
    expect(text).toContain("localhost:5173");
  });

  it("selects a tab on press-and-release", () => {
    const { container } = mount(1);
    const el = container.querySelector('[data-tab-id="3"]') as HTMLElement;
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 5 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 5 });
    expect(handlers.onSelect).toHaveBeenCalledWith(3);
  });

  it("closes a tab from its close button", () => {
    mount();
    fireEvent.click(screen.getAllByLabelText("Close tab")[1]);
    expect(handlers.onClose).toHaveBeenCalledWith(2);
  });

  it("positions the active pill once measured", () => {
    const { container } = mount();
    const pill = container.querySelector('span[aria-hidden="true"]');
    expect(pill).not.toBeNull();
    expect((pill as HTMLElement).style.transform).toContain("translate(");
  });

  it("does not commit another render when equivalent tabs keep the same pill geometry", () => {
    let commits = 0;
    const rendered = render(
      <Profiler id="tab-bar" onRender={() => commits++}>
        <TabBar tabs={tabs} activeId={1} {...handlers} />
      </Profiler>,
      {
        wrapper: ({ children }) => (
          <TooltipProvider>{children}</TooltipProvider>
        ),
      },
    );
    commits = 0;

    rendered.rerender(
      <Profiler id="tab-bar" onRender={() => commits++}>
        <TabBar tabs={[...tabs]} activeId={1} {...handlers} />
      </Profiler>,
    );

    expect(commits).toBe(1);
  });

  it("opens the new tab menu and dispatches terminal creation", () => {
    mount();
    const trigger = screen.getByTitle("Open a new surface");
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Terminal"));
    expect(handlers.onNew).toHaveBeenCalledTimes(1);
  });

  it("reorders through a full drag gesture", () => {
    const { container } = mount();
    const el = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40 });
    // jsdom rects are all zero-width, so every tab midpoint sits left of the
    // pointer and the computed gap is the end of the strip.
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 41 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 41 });
    expect(handlers.onReorder).toHaveBeenCalledWith(1, 3);
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(document.body.style.userSelect).toBe("");
  });

  it("owns the workspace split highlight and removes it after the drop", () => {
    const surface = document.createElement("div");
    surface.setAttribute("data-workspace-surface", "true");
    surface.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.append(surface);
    const { container } = mount();
    const tab = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 75, clientY: 50 });
    expect(screen.getByTestId("tab-split-drop-indicator")).toBeTruthy();
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 75, clientY: 50 });
    expect(handlers.onSplit).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId("tab-split-drop-indicator")).toBeNull();
    surface.remove();
  });

  it("cancelling a drag never commits a reorder", () => {
    const { container } = mount();
    const el = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40 });
    fireEvent.pointerCancel(el, { pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 40 });
    expect(handlers.onReorder).not.toHaveBeenCalled();
  });

  it("converts vertical wheel motion into horizontal scroll", () => {
    const { container } = mount();
    const scroller = container.firstElementChild as HTMLElement;
    Object.defineProperty(scroller, "scrollWidth", { value: 500 });
    Object.defineProperty(scroller, "clientWidth", { value: 100 });
    fireEvent.wheel(scroller, { deltaY: 40, deltaX: 0 });
    expect(scroller.scrollLeft).toBe(40);
    // A mostly-horizontal wheel is left to native scrolling.
    fireEvent.wheel(scroller, { deltaY: 5, deltaX: 30 });
    expect(scroller.scrollLeft).toBe(40);
  });

  it("commits a full rename round trip through the context menu", () => {
    const { container } = mount();
    fireEvent.contextMenu(
      container.querySelector('[data-tab-id="1"]') as HTMLElement,
    );
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "Server" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onRename).toHaveBeenCalledWith(1, "Server");
    expect(screen.queryByLabelText("Rename tab")).toBeNull();
  });
});
