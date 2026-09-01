// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalDropStore } from "../lib/dropStore";
import type { PaneNode } from "../lib/panes";
import type { TerminalSearchHandle } from "../lib/search/types";
import { PaneTreeView } from "./PaneTreeView";
import type { TerminalPaneHandle } from "./TerminalPane";

const paneProps = vi.hoisted(
  () =>
    [] as Array<{
      leafId: number;
      workspace: { kind: "local" };
      visible: boolean;
      focused?: boolean;
      initialCwd?: string;
      blocks?: boolean;
    }>,
);

vi.mock("./TerminalPane", () => ({
  TerminalPane: (props: (typeof paneProps)[number]) => {
    paneProps.push(props);
    return <div data-testid={`term-pane-${props.leafId}`} />;
  },
}));

function leaf(id: number, cwd?: string): PaneNode {
  return { kind: "leaf", id, cwd };
}

function makeBundle() {
  return {
    setRef: vi.fn<(handle: TerminalPaneHandle | null) => void>(),
    onSearchReady:
      vi.fn<(leafId: number, addon: TerminalSearchHandle) => void>(),
    onCwd: vi.fn<(leafId: number, cwd: string) => void>(),
    onExit: vi.fn<(leafId: number, code: number) => void>(),
  };
}

const onFocusLeaf = vi.fn();

function mount(node: PaneNode, activeLeafId = 1, tabVisible = true) {
  return render(
    <PaneTreeView
      node={node}
      workspace={{ kind: "local" }}
      tabVisible={tabVisible}
      activeLeafId={activeLeafId}
      blocks={false}
      onFocusLeaf={onFocusLeaf}
      getBundle={makeBundle}
    />,
  );
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", FakeResizeObserver);

beforeEach(() => {
  vi.clearAllMocks();
  paneProps.length = 0;
  useTerminalDropStore.getState().setTarget(null);
});

afterEach(cleanup);

describe("PaneTreeView", () => {
  it("renders a leaf with its pane wrapper and data attribute", () => {
    const { container } = mount(leaf(1, "/cwd"));
    expect(container.querySelector('[data-pane-leaf="1"]')).not.toBeNull();
    expect(paneProps[0]).toMatchObject({
      leafId: 1,
      workspace: { kind: "local" },
      visible: true,
      focused: true,
      initialCwd: "/cwd",
      blocks: false,
    });
  });

  it("marks non-active leaves as unfocused", () => {
    mount(leaf(2), 1);
    expect(paneProps[0].focused).toBe(false);
  });

  it("focuses an unfocused leaf on mouse down", () => {
    const { container } = mount(leaf(2), 1);
    const element = container.querySelector('[data-pane-leaf="2"]');
    if (!element) throw new Error("leaf wrapper missing");
    fireEvent.mouseDown(element);
    expect(onFocusLeaf).toHaveBeenCalledWith(2);
  });

  it("does not re-focus the already active leaf", () => {
    const { container } = mount(leaf(1), 1);
    const element = container.querySelector('[data-pane-leaf="1"]');
    if (!element) throw new Error("leaf wrapper missing");
    fireEvent.mouseDown(element);
    fireEvent.focus(element);
    expect(onFocusLeaf).not.toHaveBeenCalled();
  });

  it("syncs activeLeafId when DOM focus lands on another pane", () => {
    const { container } = mount(leaf(3), 1);
    const element = container.querySelector('[data-pane-leaf="3"]');
    if (!element) throw new Error("leaf wrapper missing");
    fireEvent.focus(element);
    expect(onFocusLeaf).toHaveBeenCalledWith(3);
  });

  it("renders splits recursively with resize handles between panes", () => {
    const node: PaneNode = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3)],
    };
    const { container } = mount(node);
    expect(screen.getByTestId("term-pane-1")).toBeInTheDocument();
    expect(screen.getByTestId("term-pane-2")).toBeInTheDocument();
    expect(screen.getByTestId("term-pane-3")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="resizable-handle"]'),
    ).toHaveLength(2);
  });

  it("renders nested splits", () => {
    const node: PaneNode = {
      kind: "split",
      id: 100,
      dir: "col",
      children: [
        leaf(1),
        {
          kind: "split",
          id: 101,
          dir: "row",
          children: [leaf(2), leaf(3)],
        },
      ],
    };
    mount(node);
    expect(paneProps.map((props) => props.leafId)).toEqual([1, 2, 3]);
  });

  it("shows the drop overlay only on the targeted leaf", () => {
    const node: PaneNode = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    const { rerender } = mount(node);
    expect(screen.queryByText("Drop file path here")).not.toBeInTheDocument();
    useTerminalDropStore.getState().setTarget(2);
    rerender(
      <PaneTreeView
        node={node}
        workspace={{ kind: "local" }}
        tabVisible
        activeLeafId={1}
        blocks={false}
        onFocusLeaf={onFocusLeaf}
        getBundle={makeBundle}
      />,
    );
    const overlay = screen.getByText("Drop file path here");
    expect(overlay.closest('[data-pane-leaf="2"]')).not.toBeNull();
  });
});
