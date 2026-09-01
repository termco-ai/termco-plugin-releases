// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../tabTypes";
import type { PaneNode } from "./lib/panes";
import { TerminalStack } from "./TerminalStack";

type CapturedProps = {
  node: PaneNode;
  workspace: { kind: "local" };
  tabVisible: boolean;
  activeLeafId: number;
  blocks: boolean;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => {
    setRef: (handle: unknown) => void;
    onSearchReady: (leafId: number, addon: unknown) => void;
    onCwd: (leafId: number, cwd: string) => void;
    onExit: (leafId: number, code: number) => void;
  };
};

const captured = vi.hoisted(() => [] as CapturedProps[]);

vi.mock("./components/PaneTreeView", () => ({
  PaneTreeView: (props: CapturedProps) => {
    captured.push(props);
    return <div data-testid={`tree-${props.node.id}`} />;
  },
}));

function termTab(id: number, over: Partial<Tab> = {}): Tab {
  return {
    id,
    kind: "terminal",
    rigId: "rig-a",
    title: "shell",
    workspace: { kind: "local" },
    paneTree: { kind: "leaf", id: id * 10 },
    activeLeafId: id * 10,
    ...over,
  } as Tab;
}

const handlers = {
  registerHandle: vi.fn(),
  onSearchReady: vi.fn(),
  onCwd: vi.fn(),
  onExit: vi.fn(),
  onFocusLeaf: vi.fn(),
};

function mount(tabs: Tab[], activeId: number) {
  return render(
    <TerminalStack tabs={tabs} activeId={activeId} {...handlers} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
});

afterEach(cleanup);

describe("TerminalStack", () => {
  it("mounts every live terminal but only shows the active tab", () => {
    const { container } = mount([termTab(1), termTab(2)], 2);
    const wrappers = container.querySelectorAll(":scope > div > div");
    expect(wrappers).toHaveLength(2);
    expect((wrappers[0] as HTMLElement).style.visibility).toBe("hidden");
    expect((wrappers[0] as HTMLElement).style.pointerEvents).toBe("none");
    expect(wrappers[0]).toHaveAttribute("aria-hidden", "true");
    expect((wrappers[1] as HTMLElement).style.visibility).toBe("visible");
    expect((wrappers[1] as HTMLElement).style.pointerEvents).toBe("auto");
  });

  it("skips cold terminals and non-terminal tabs", () => {
    mount(
      [
        termTab(1, { cold: true } as Partial<Tab>),
        termTab(2),
        {
          id: 3,
          kind: "editor",
          rigId: "rig-a",
          title: "x",
          path: "/x.ts",
          dirty: false,
          preview: false,
        } as Tab,
      ],
      2,
    );
    expect(captured.map((props) => props.node.id)).toEqual([20]);
  });

  it("passes tab visibility and pane state to the tree view", () => {
    mount([termTab(1, { blocks: true } as Partial<Tab>), termTab(2)], 1);
    expect(captured[0]).toMatchObject({
      workspace: { kind: "local" },
      tabVisible: true,
      activeLeafId: 10,
      blocks: true,
    });
    expect(captured[1]).toMatchObject({ tabVisible: false, blocks: false });
  });

  it("reports pane focus with the owning tab id", () => {
    mount([termTab(4)], 4);
    captured[0].onFocusLeaf(40);
    expect(handlers.onFocusLeaf).toHaveBeenCalledWith(4, 40);
  });

  it("returns a stable bundle per leaf across renders", () => {
    const tabs = [termTab(1)];
    const { rerender } = mount(tabs, 1);
    const first = captured[0].getBundle(10);
    rerender(<TerminalStack tabs={tabs} activeId={1} {...handlers} />);
    const second = captured[captured.length - 1].getBundle(10);
    expect(second).toBe(first);
  });

  it("routes bundle callbacks to the latest handler props", () => {
    const tabs = [termTab(1)];
    const { rerender } = mount(tabs, 1);
    const bundle = captured[0].getBundle(10);
    const lateExit = vi.fn();
    rerender(
      <TerminalStack
        tabs={tabs}
        activeId={1}
        {...handlers}
        onExit={lateExit}
      />,
    );
    bundle.onExit(10, 0);
    expect(lateExit).toHaveBeenCalledWith(10, 0);
    expect(handlers.onExit).not.toHaveBeenCalled();

    bundle.onCwd(10, "/somewhere");
    expect(handlers.onCwd).toHaveBeenCalledWith(10, "/somewhere");
    bundle.setRef("handle");
    expect(handlers.registerHandle).toHaveBeenCalledWith(10, "handle");
    bundle.onSearchReady(10, "addon");
    expect(handlers.onSearchReady).toHaveBeenCalledWith(10, "addon");
  });

  it("drops bundles for leaves that no longer exist", () => {
    const { rerender } = mount([termTab(1), termTab(2)], 1);
    const gone = captured[0].getBundle(10);
    rerender(
      <TerminalStack tabs={[termTab(2)]} activeId={2} {...handlers} />,
    );
    const recreated = captured[captured.length - 1].getBundle(10);
    expect(recreated).not.toBe(gone);
  });
});
