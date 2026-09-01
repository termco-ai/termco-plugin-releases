// @vitest-environment jsdom
import type {
  ShortcutHandlers,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import type { UiHeaderTab } from "@termco/ui-header-base";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHeaderTabSwitcher } from "./useHeaderTabSwitcher";

let registered: ShortcutHandlers = {};
const shortcuts = {
  useHandlers(handlers: ShortcutHandlers) {
    registered = handlers;
  },
} as ShortcutRegistryCapability;

function tab(id: number, rigId = "rig-a"): UiHeaderTab {
  return {
    id,
    rigId,
    kind: "terminal",
    title: `Tab ${id}`,
    label: `Tab ${id}`,
    dirty: false,
    preview: false,
    private: false,
  };
}

function setup(
  allTabs: UiHeaderTab[],
  activeId: number,
  tabs = allTabs,
) {
  const selectTab = vi.fn();
  const view = renderHook(
    (props: {
      allTabs: UiHeaderTab[];
      tabs: UiHeaderTab[];
      activeId: number;
    }) =>
      useHeaderTabSwitcher({
        ...props,
        selectTab,
        shortcuts,
      }),
    { initialProps: { allTabs, tabs, activeId } },
  );
  return { ...view, selectTab };
}

afterEach(() => {
  registered = {};
  cleanup();
});

describe("header-owned MRU tab switcher", () => {
  it("does not open for one tab", () => {
    const view = setup([tab(1)], 1);
    act(() => registered["tab.next"]?.(new KeyboardEvent("keydown")));
    expect(view.result.current).toBeNull();
  });

  it("preserves MRU order and scopes candidates to the current rig", () => {
    const all = [tab(1), tab(2, "rig-b"), tab(3), tab(4)];
    const view = setup(all, 1, [all[0], all[2], all[3]]);
    view.rerender({ allTabs: all, tabs: [all[0], all[2], all[3]], activeId: 3 });
    view.rerender({ allTabs: all, tabs: [all[0], all[2], all[3]], activeId: 1 });
    act(() => registered["tab.next"]?.(new KeyboardEvent("keydown")));
    expect(view.result.current).toEqual({ order: [1, 3, 4], index: 1 });
  });

  it("commits on modifier release and cancels when the candidate closed", () => {
    const all = [tab(1), tab(2), tab(3)];
    const view = setup(all, 1);
    act(() => registered["tab.next"]?.(new KeyboardEvent("keydown")));
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" })));
    expect(view.selectTab).toHaveBeenCalledWith(2);
    expect(view.result.current).toBeNull();

    act(() => registered["tab.next"]?.(new KeyboardEvent("keydown")));
    view.rerender({ allTabs: [all[0]], tabs: [all[0]], activeId: 1 });
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" })));
    expect(view.selectTab).toHaveBeenCalledTimes(1);
  });
});
