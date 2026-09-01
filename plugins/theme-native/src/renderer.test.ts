// @vitest-environment jsdom
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createThemeCapability } from "./renderer";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});

function harness(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const emit = vi.fn();
  const preferences: PreferencesCapability = {
    get: async <T,>(key: string) => values.get(key) as T | undefined,
    getMany: async (keys) => Object.fromEntries(keys.filter((key) => values.has(key)).map((key) => [key, values.get(key)])),
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => values.delete(key),
    subscribe: () => () => {},
  };
  const events: ApplicationEventsCapability = {
    emit,
    subscribe: () => () => {},
    subscribeAll: () => () => {},
    listenerCount: () => 0,
  };
  return { values, emit, preferences, events };
}

describe("ui.theme provider", () => {
  it("loads, publishes, mutates, and persists one shared snapshot", async () => {
    const test = harness({ theme: "dark", themeId: "nord", editorTheme: "auto" });
    const capability = await createThemeCapability(test.preferences, test.events);
    const listener = vi.fn();
    capability.subscribe(listener);
    expect(capability.snapshot()).toMatchObject({ mode: "dark", themeId: "nord" });
    expect(capability.snapshot().themes).toHaveLength(15);

    await capability.mutate({ type: "set-mode", mode: "light" });
    await capability.mutate({ type: "set-theme", id: "dracula" });
    await capability.mutate({ type: "set-editor-theme", id: "github-light" });
    expect(test.values.get("theme")).toBe("light");
    expect(test.values.get("themeId")).toBe("dracula");
    expect(test.values.get("editorTheme")).toBe("github-light");
    expect(listener).toHaveBeenCalled();
  });

  it("owns custom-theme creation, editing events, selection, and deletion", async () => {
    const test = harness();
    const capability = await createThemeCapability(test.preferences, test.events);
    const created = await capability.mutate({ type: "request-edit", request: { action: "create" } });
    expect(created.themeId).toMatch(/^my-theme-/);
    expect(capability.snapshot().themeId).toBe(created.themeId);
    expect(capability.snapshot().customThemeIds).toContain(created.themeId);
    expect(test.emit).toHaveBeenCalledWith("termco://theme-edit", { action: "edit", id: created.themeId });

    await capability.mutate({ type: "delete-custom-theme", id: created.themeId as string });
    expect(capability.snapshot().customThemeIds).not.toContain(created.themeId);
    expect(capability.snapshot().themeId).toBe("termco-default");
  });
});
