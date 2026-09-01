import { describe, expect, it, vi } from "vitest";
import { SidebarNavigation } from "./navigation";

function setup(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  };
  const timers: Array<() => void> = [];
  const navigation = new SidebarNavigation(storage, {
    set: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clear: vi.fn(),
  });
  const panel = {
    isCollapsed: vi.fn(() => false),
    resize: vi.fn(),
    collapse: vi.fn(),
  };
  navigation.bindPanel(panel);
  return { navigation, panel, storage, data, flush: () => timers.shift()?.() };
}

describe("ui.sidebar-navigation", () => {
  it("hydrates and clamps the established persisted state", () => {
    const s = setup({
      "termco.sidebar.view": "source-control",
      "termco.sidebar.collapsed": "1",
      "termco.sidebar.width": "9999",
    });
    expect(s.navigation.snapshot()).toMatchObject({
      view: "source-control",
      initialCollapsed: true,
      width: 528,
    });
  });

  it("selects and persists a rail view", () => {
    const s = setup();
    const listener = vi.fn();
    s.navigation.subscribe(listener);
    s.navigation.select("search");
    expect(s.navigation.snapshot().view).toBe("search");
    expect(s.data.get("termco.sidebar.view")).toBe("search");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("shows a different view and expands a collapsed panel", () => {
    const s = setup({ "termco.sidebar.width": "320" });
    s.panel.isCollapsed.mockReturnValue(true);
    s.navigation.show("source-control");
    expect(s.panel.resize).toHaveBeenCalledWith("320px");
    expect(s.navigation.snapshot().view).toBe("source-control");
  });

  it("collapses when a command shows the already active expanded view", () => {
    const s = setup();
    s.navigation.show("explorer");
    expect(s.panel.collapse).toHaveBeenCalledOnce();
  });

  it("toggles the bound panel without duplicating state", () => {
    const s = setup({ "termco.sidebar.width": "300" });
    s.navigation.toggle();
    expect(s.panel.collapse).toHaveBeenCalledOnce();
    s.panel.isCollapsed.mockReturnValue(true);
    s.navigation.toggle();
    expect(s.panel.resize).toHaveBeenCalledWith("300px");
  });

  it("persists collapsed state only on changes and debounces width", () => {
    const s = setup();
    s.navigation.setCollapsed(true);
    s.storage.setItem.mockClear();
    s.navigation.setCollapsed(true);
    expect(s.storage.setItem).not.toHaveBeenCalled();
    s.navigation.setWidth(300);
    s.navigation.setWidth(320);
    expect(s.data.get("termco.sidebar.width")).toBeUndefined();
    s.flush();
    s.flush();
    expect(s.data.get("termco.sidebar.width")).toBe("320");
  });
});
