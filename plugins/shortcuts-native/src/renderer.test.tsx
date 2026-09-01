// @vitest-environment jsdom
import type {
  KeyBinding,
  ShortcutHandlers,
  ShortcutId,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityRuntime } from "@termco/kernel";
import plugin, { createShortcutCapability } from "./renderer";

let capability: ShortcutRegistryCapability;
let dispose: () => void;

beforeEach(async () => {
  let stored: Record<string, KeyBinding[]> = {};
  const preferences: PreferencesCapability = {
    get: async <T,>() => stored as T,
    getMany: async () => ({}),
    set: async (_key, value) => {
      stored = value as Record<string, KeyBinding[]>;
    },
    delete: async () => false,
    subscribe: () => () => {},
  };
  const runtime = await createShortcutCapability(preferences);
  capability = runtime.capability;
  dispose = runtime.dispose;
});

afterEach(() => {
  cleanup();
  dispose();
});

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    cancelable: true,
    bubbles: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

function useHandlers(
  handlers: ShortcutHandlers,
  isDisabled?: (id: ShortcutId, event: KeyboardEvent) => boolean,
) {
  return renderHook(() => capability.useHandlers(handlers, { isDisabled }));
}

describe("provider-owned global shortcut dispatch", () => {
  it("keeps one default registry active while preference persistence leaves and returns", async () => {
    const manifest = (id: string) => ({
      schemaVersion: 3,
      id,
      name: id,
      description: id,
      category: "Test",
      version: "1.0.0",
      entrypoints: { renderer: "src/renderer.ts" },
      dependencies: {},
    });
    const shortcuts = manifest("shortcuts-native");
    const preferencesProvider = manifest("preferences-json");
    const runtime = new CapabilityRuntime({
      profileId: "test.shortcuts",
      plugins: [shortcuts, preferencesProvider].map((entry) => ({
        id: entry.id,
        manifest: entry,
        source: {
          type: "local",
          module: entry.id,
          location: entry.id,
          integrity: entry.id,
        },
      })),
      activationOrder: [shortcuts.id, preferencesProvider.id],
    } as never);
    let stored: Record<string, KeyBinding[]> = {
      "tab.new": [{ alt: true, key: "n" }],
    };
    const preferences: PreferencesCapability = {
      get: async <T,>() => stored as T,
      getMany: async () => ({}),
      set: async (_key, value) => {
        stored = value as Record<string, KeyBinding[]>;
      },
      delete: async () => false,
      subscribe: () => () => {},
    };

    await runtime.activate(shortcuts.id, plugin);
    const registry = runtime.platformCapability<ShortcutRegistryCapability>(
      "shortcuts.registry",
    );
    expect(registry.bindings("tab.new")).toEqual([
      expect.objectContaining({ key: "t" }),
    ]);

    await runtime.activate(preferencesProvider.id, {
      activate: (context) =>
        context.provide("settings.preferences", preferences),
    });
    expect(runtime.platformCapability("shortcuts.registry")).toBe(registry);
    expect(registry.bindings("tab.new")).toEqual([
      { alt: true, key: "n" },
    ]);

    await runtime.deactivate(preferencesProvider.id);
    expect(runtime.platformCapability("shortcuts.registry")).toBe(registry);
    expect(runtime.inspect()).toContainEqual({
      pluginId: shortcuts.id,
      state: "active",
    });
    await registry.setBindings("tab.new", [{ key: "x" }]);
    expect(registry.bindings("tab.new")).toEqual([{ key: "x" }]);
    expect(runtime.lifecycleDiagnostics(shortcuts.id).successfulActivations).toBe(
      1,
    );

    await runtime.activate(preferencesProvider.id, {
      activate: (context) =>
        context.provide("settings.preferences", preferences),
    });
    expect(runtime.platformCapability("shortcuts.registry")).toBe(registry);
    expect(registry.bindings("tab.new")).toEqual([{ key: "x" }]);
    expect(stored["tab.new"]).toEqual([{ key: "x" }]);
    await runtime.deactivate(shortcuts.id);
  });

  it("runs a matching default binding and claims the event", () => {
    const onNew = vi.fn();
    useHandlers({ "tab.new": onNew });
    const event = key({ key: "t", ctrlKey: true });
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores unmatched events and matched actions without a consumer", () => {
    const onNew = vi.fn();
    useHandlers({ "tab.new": onNew });
    expect(key({ key: "x", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key({ key: "w", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(onNew).not.toHaveBeenCalled();
  });

  it("skips repeats unless the shortcut definition allows them", () => {
    const onNew = vi.fn();
    const onPreviousBlock = vi.fn();
    useHandlers({
      "tab.new": onNew,
      "blocks.prev": onPreviousBlock,
    });
    key({ key: "t", ctrlKey: true, repeat: true });
    key({ key: "ArrowUp", ctrlKey: true, repeat: true });
    expect(onNew).not.toHaveBeenCalled();
    expect(onPreviousBlock).toHaveBeenCalledTimes(1);
  });

  it("lets context-disabled shortcuts fall through untouched", () => {
    const onNew = vi.fn();
    const isDisabled = vi.fn(() => true);
    useHandlers({ "tab.new": onNew }, isDisabled);
    const event = key({ key: "t", ctrlKey: true });
    expect(isDisabled).toHaveBeenCalledWith("tab.new", event);
    expect(onNew).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("uses persisted overrides instead of default bindings", async () => {
    await act(() =>
      capability.setBindings("tab.new", [{ alt: true, key: "n" }]),
    );
    const onNew = vi.fn();
    useHandlers({ "tab.new": onNew });
    key({ key: "t", ctrlKey: true });
    expect(onNew).not.toHaveBeenCalled();
    key({ key: "n", altKey: true });
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("matches any configured binding and digit-index special handling", () => {
    const onToggle = vi.fn();
    const onJump = vi.fn();
    useHandlers({
      "sidebar.toggle": onToggle,
      "tab.selectByIndex": onJump,
    });
    key({ key: "b", ctrlKey: true });
    key({ key: "b", ctrlKey: true, shiftKey: true });
    key({ key: "4", ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect((onJump.mock.calls[0][0] as KeyboardEvent).key).toBe("4");
  });

  it("uses the latest handler closure without reinstalling the global listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handlers }: { handlers: ShortcutHandlers }) =>
        capability.useHandlers(handlers),
      { initialProps: { handlers: { "tab.new": first } } },
    );
    rerender({ handlers: { "tab.new": second } });
    key({ key: "t", ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("unregisters consumer actions on unmount", () => {
    const onNew = vi.fn();
    const mounted = useHandlers({ "tab.new": onNew });
    mounted.unmount();
    key({ key: "t", ctrlKey: true });
    expect(onNew).not.toHaveBeenCalled();
  });

  it("never captures keys from a shortcut recorder", () => {
    const onNew = vi.fn();
    useHandlers({ "tab.new": onNew });
    const recorder = document.createElement("div");
    recorder.dataset.shortcutRecorder = "true";
    const input = document.createElement("input");
    recorder.append(input);
    document.body.append(recorder);
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        cancelable: true,
        bubbles: true,
      }),
    );
    expect(onNew).not.toHaveBeenCalled();
    recorder.remove();
  });

  it("removes the one application listener when the provider deactivates", () => {
    const onNew = vi.fn();
    useHandlers({ "tab.new": onNew });
    dispose();
    key({ key: "t", ctrlKey: true });
    expect(onNew).not.toHaveBeenCalled();
  });
});
