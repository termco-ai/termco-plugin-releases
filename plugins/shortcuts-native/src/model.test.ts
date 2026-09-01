import { describe, expect, it, vi } from "vitest";
import type { PreferencesCapability } from "@termco/storage-base";
import { createShortcutRegistry, matchBinding } from "./model";

describe("application shortcut provider", () => {
  it("preserves the complete current shortcut catalog and group order", async () => {
    const registry = await createShortcutRegistry({
      get: async <T>() => ({} as T),
      getMany: async () => ({}),
      set: async () => {},
      delete: async () => false,
      subscribe: () => () => {},
    });

    expect(registry.snapshot().groups).toEqual([
      "General", "Tabs", "Rigs", "Panes", "Terminal", "View", "Search", "AI", "Editor",
    ]);
    expect(registry.snapshot().shortcuts.map(({ id }) => id)).toEqual([
      "commandPalette.open",
      "commandPalette.content",
      "settings.open",
      "tab.new",
      "tab.newBlock",
      "tab.newPrivate",
      "tab.newPreview",
      "tab.newEditor",
      "tab.close",
      "tab.next",
      "tab.prev",
      "tab.selectByIndex",
      "rig.next",
      "rig.prev",
      "rig.overview",
      "pane.splitRight",
      "pane.splitDown",
      "pane.focusNext",
      "pane.focusPrev",
      "pane.source",
      "terminal.clear",
      "terminal.toggleInput",
      "blocks.prev",
      "blocks.next",
      "sidebar.toggle",
      "explorer.focus",
      "view.zoomIn",
      "view.zoomOut",
      "view.zoomReset",
      "view.zenMode",
      "explorer.search",
      "search.focus",
      "ai.toggle",
      "ai.askSelection",
      "agent.focusAttention",
      "editor.undo",
      "editor.redo",
    ]);
  });

  it("owns definitions, overrides, matching, and durable writes", async () => {
    const set = vi.fn(async () => {});
    const preferences: PreferencesCapability = {
      get: async <T>() => ({ "tab.new": [{ ctrl: true, key: "n" }] } as T),
      getMany: async () => ({}), set, delete: async () => true,
      subscribe: () => () => {},
    };
    const registry = await createShortcutRegistry(preferences);
    expect(registry.bindings("tab.new")).toEqual([{ ctrl: true, key: "n" }]);
    await registry.setBindings("tab.new", [{ alt: true, key: "t" }]);
    expect(set).toHaveBeenCalledWith("shortcuts", expect.objectContaining({ "tab.new": [{ alt: true, key: "t" }] }));
    expect(matchBinding({ key: "4", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }, { ctrl: true, key: "1" }, "tab.selectByIndex")).toBe(true);
  });

  it("owns reactive labels, unbound actions, resets, and formatting", async () => {
    let stored: Record<string, Array<{ key: string; alt?: boolean }>> = {};
    const set = vi.fn(async (_key: string, value: unknown) => {
      stored = value as typeof stored;
    });
    const registry = await createShortcutRegistry({
      get: async <T>() => stored as T,
      getMany: async () => ({}),
      set,
      delete: async () => false,
      subscribe: () => () => {},
    });
    const changed = vi.fn();
    registry.subscribe(changed);

    const defaultLabel = registry.format(
      registry.bindings("agent.focusAttention")[0],
    );
    expect(defaultLabel.at(-1)).toBe("A");
    expect(defaultLabel).toHaveLength(3);
    expect(registry.bindings("terminal.clear")).toEqual([]);

    await registry.setBindings("agent.focusAttention", [
      { alt: true, key: "a" },
    ]);
    const overrideLabel = registry.format(
      registry.bindings("agent.focusAttention")[0],
    );
    expect(overrideLabel.at(-1)).toBe("A");
    expect(overrideLabel).toHaveLength(2);
    expect(changed).toHaveBeenCalled();

    await registry.reset("agent.focusAttention");
    expect(
      registry.format(registry.bindings("agent.focusAttention")[0]),
    ).toEqual(defaultLabel);
    await expect(
      registry.setBindings("missing.action", [{ key: "x" }]),
    ).rejects.toThrow("Unknown shortcut: missing.action");
  });
});
