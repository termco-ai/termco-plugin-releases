// @vitest-environment jsdom
import "../../testDependencies";
import type { Tab } from "../../types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RigMeta } from "../../types";
import type { DropTarget } from "../types";
import { RigRow } from "./RigRow";

afterEach(cleanup);

function meta(over: Partial<RigMeta> = {}): RigMeta {
  return {
    id: "sp1",
    name: "Work",
    root: null,
    workspaceKind: "local",
    ...over,
  };
}

function term(id: number): Tab {
  return {
    id,
    kind: "terminal",
    rigId: "sp1",
    title: "shell",
    label: `termco-${id}`,
    dirty: false,
    preview: false,
    private: false,
    cwd: `/w/${id}`,
  };
}

const callbacks = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onToggle: vi.fn(),
  onSwitch: vi.fn(),
  onStartRename: vi.fn(),
  onCommitRename: vi.fn(),
  onCancelRename: vi.fn(),
  onDelete: vi.fn(),
  onNewTab: vi.fn(),
  onJumpTab: vi.fn(),
  onCloseTab: vi.fn(),
};

type Overrides = Partial<{
  tabs: Tab[];
  isActive: boolean;
  canDelete: boolean;
  expanded: boolean;
  editing: boolean;
  dragging: { kind: "rig" | "tab"; id: string | number } | null;
  drop: DropTarget | null;
  draggingTabFromOther: boolean;
}>;

function mount(rig = meta(), over: Overrides = {}) {
  return render(
    <RigRow
      rig={rig}
      tabs={over.tabs ?? [term(1), term(2)]}
      isActive={over.isActive ?? false}
      canDelete={over.canDelete ?? true}
      expanded={over.expanded ?? false}
      editing={over.editing ?? false}
      dragging={over.dragging ?? null}
      drop={over.drop ?? null}
      draggingTabFromOther={over.draggingTabFromOther ?? false}
      {...callbacks}
    />,
  );
}

function headerEl(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-drop="rig"]') as HTMLElement;
}

beforeEach(() => vi.clearAllMocks());

describe("RigRow header", () => {
  it("shows the name and tab count", () => {
    const { container } = mount();
    const header = headerEl(container);
    expect(header.textContent).toContain("Work");
    expect(header.textContent).toContain("2");
    expect(header.getAttribute("data-rig-id")).toBe("sp1");
  });

  it("switches on Enter", () => {
    const { container } = mount();
    fireEvent.keyDown(headerEl(container), { key: "Enter" });
    expect(callbacks.onSwitch).toHaveBeenCalledTimes(1);
  });

  it("toggles expansion from the chevron without dragging", () => {
    const { container } = mount();
    fireEvent.click(screen.getByLabelText("Expand"));
    expect(callbacks.onToggle).toHaveBeenCalledTimes(1);
    expect(headerEl(container).textContent).toContain("Work");
  });

  it("labels the chevron as collapse when expanded", () => {
    mount(meta(), { expanded: true });
    expect(screen.getByLabelText("Collapse")).toBeTruthy();
  });

  it("exposes rename, new tab and delete hover actions", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Rename rig"));
    expect(callbacks.onStartRename).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("New tab"));
    expect(callbacks.onNewTab).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Delete rig"));
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides delete for the last rig", () => {
    mount(meta(), { canDelete: false });
    expect(screen.queryByLabelText("Delete rig")).toBeNull();
  });

  it("starts drags through the pointer handlers", () => {
    const { container } = mount();
    fireEvent.pointerDown(headerEl(container), { button: 0, pointerId: 1 });
    expect(callbacks.onPointerDown).toHaveBeenCalledWith(
      expect.anything(),
      "rig",
      "sp1",
    );
    fireEvent.pointerUp(headerEl(container), { pointerId: 1 });
    expect(callbacks.onPointerUp).toHaveBeenCalledWith(
      expect.anything(),
      callbacks.onSwitch,
    );
  });
});

describe("RigRow editing", () => {
  it("swaps the name for an inline rename field", () => {
    mount(meta(), { editing: true });
    const input = screen.getByLabelText("Rename rig") as HTMLInputElement;
    expect(input.defaultValue).toBe("Work");
    fireEvent.change(input, { target: { value: "Home" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(callbacks.onCommitRename).toHaveBeenCalledWith("Home");
  });

  it("suppresses pointer and keyboard activation while editing", () => {
    const { container } = mount(meta(), { editing: true });
    fireEvent.keyDown(headerEl(container), { key: "Enter" });
    expect(callbacks.onSwitch).not.toHaveBeenCalled();
  });
});

describe("RigRow drop states", () => {
  it("dims while the rig itself is dragged", () => {
    const { container } = mount(meta(), {
      dragging: { kind: "rig", id: "sp1" },
    });
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "opacity-50",
    );
  });

  it("shows a reorder line when another rig hovers over it", () => {
    const { container } = mount(meta(), {
      dragging: { kind: "rig", id: "sp2" },
      drop: { kind: "rig", rigId: "sp1", edge: "bottom" },
    });
    expect(container.querySelector(".bg-primary")).not.toBeNull();
  });

  it("highlights the header when a tab would move into it", () => {
    const { container } = mount(meta(), {
      dragging: { kind: "tab", id: 9 },
      drop: { kind: "into-rig", rigId: "sp1" },
    });
    expect(headerEl(container).className).toContain("bg-primary/10");
  });
});

describe("RigRow tabs", () => {
  it("renders child tab rows only when expanded", () => {
    const { container } = mount(meta(), { expanded: false });
    expect(container.querySelectorAll('[data-drop="tab"]')).toHaveLength(0);
    cleanup();
    const { container: openC } = mount(meta(), { expanded: true });
    expect(openC.querySelectorAll('[data-drop="tab"]')).toHaveLength(2);
  });

  it("wires jump and close through per-tab callbacks", () => {
    const { container } = mount(meta(), { expanded: true });
    const rows = container.querySelectorAll<HTMLElement>('[data-drop="tab"]');
    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(callbacks.onJumpTab).toHaveBeenCalledWith(2);
    fireEvent.click(
      rows[0].querySelector('[aria-label="Close tab"]') as HTMLElement,
    );
    expect(callbacks.onCloseTab).toHaveBeenCalledWith(1);
  });

  it("shows the empty state and the drop hint", () => {
    mount(meta(), { expanded: true, tabs: [] });
    expect(screen.getByText("No tabs")).toBeTruthy();
    cleanup();
    mount(meta(), {
      expanded: true,
      tabs: [],
      draggingTabFromOther: true,
    });
    expect(screen.getByText("Drop to move here")).toBeTruthy();
  });
});
