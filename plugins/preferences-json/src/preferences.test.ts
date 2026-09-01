import { describe, expect, it, vi } from "vitest";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import {
  createPreferences,
  createStablePreferences,
  PREFERENCES_CHANGED_EVENT,
  PREFERENCES_STORE,
} from "./preferences";

function harness(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const save = vi.fn(async () => {});
  const emit = vi.fn();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const handle: StorageHandle = {
    get: <T>(key: string) => values.get(key) as T | undefined,
    set: (key, value) => void values.set(key, value),
    has: (key) => values.has(key),
    delete: (key) => values.delete(key),
    keys: () => [...values.keys()],
    values: () => [...values.values()],
    entries: () => [...values.entries()],
    clear: () => values.clear(),
    reset: () => values.clear(),
    save,
  };
  const storage = {
    open: vi.fn(async () => handle),
    close: vi.fn(async () => {}),
  } satisfies StorageCapability;
  const events = {
    emit: vi.fn((event: string, payload: unknown) => {
      emit(event, payload);
      for (const listener of listeners.get(event) ?? []) listener(payload);
    }),
    subscribe: vi.fn((event: string, listener: (payload: unknown) => void) => {
      const current = listeners.get(event) ?? new Set();
      current.add(listener);
      listeners.set(event, current);
      return () => current.delete(listener);
    }),
    subscribeAll: vi.fn(),
    listenerCount: vi.fn(() => 0),
  } as unknown as ApplicationEventsCapability;
  return { values, save, emit, storage, events };
}

describe("preferences provider", () => {
  it("keeps one in-memory facade while durable storage leaves and returns", async () => {
    const stable = createStablePreferences();
    const listener = vi.fn();
    stable.capability.subscribe(listener);

    await stable.capability.set("zoomLevel", 1.1);
    await expect(stable.capability.get("zoomLevel")).resolves.toBe(1.1);

    const h = harness({ zoomLevel: 1.25 });
    const unbind = await stable.bind(h.storage, h.events);
    await expect(stable.capability.get("zoomLevel")).resolves.toBe(1.25);
    await stable.capability.set("zoomLevel", 1.5);
    expect(h.save).toHaveBeenCalledOnce();

    await unbind();
    await stable.capability.set("zoomLevel", 2);
    await expect(stable.capability.get("zoomLevel")).resolves.toBe(2);
    expect(listener).toHaveBeenCalled();
  });

  it("replaces provider hydration without discarding locally authored state", async () => {
    const stable = createStablePreferences();
    const first = harness({
      "provider.only": "first",
      "user.choice": "first",
    });
    const unbindFirst = await stable.bind(first.storage, first.events);

    await stable.capability.set("user.choice", "local");
    await stable.capability.set("local.only", true);
    await unbindFirst();

    const second = harness({
      "provider.next": "second",
      "user.choice": "second",
    });
    await stable.bind(second.storage, second.events);

    await expect(stable.capability.get("provider.only")).resolves.toBeUndefined();
    await expect(stable.capability.get("provider.next")).resolves.toBe("second");
    await expect(stable.capability.get("user.choice")).resolves.toBe("local");
    await expect(stable.capability.get("local.only")).resolves.toBe(true);
  });

  it("shares one named durable store and reads several keys", async () => {
    const h = harness({ vimMode: true, editorWordWrap: false });
    const preferences = await createPreferences(h.storage, h.events);
    expect(h.storage.open).toHaveBeenCalledWith(PREFERENCES_STORE);
    await expect(preferences.getMany(["vimMode", "editorWordWrap", "missing"]))
      .resolves.toEqual({ vimMode: true, editorWordWrap: false });
  });

  it("persists before publishing a cross-window change", async () => {
    const h = harness();
    const preferences = await createPreferences(h.storage, h.events);
    await preferences.set("editorAutoSave", true);
    expect(h.values.get("editorAutoSave")).toBe(true);
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.emit).toHaveBeenCalledWith(PREFERENCES_CHANGED_EVENT, {
      key: "editorAutoSave",
      value: true,
    });
  });

  it("rejects unsafe keys and undefined values", async () => {
    const h = harness();
    const preferences = await createPreferences(h.storage, h.events);
    await expect(preferences.set("__proto__", true)).rejects.toThrow("invalid preference key");
    await expect(preferences.set("vimMode", undefined)).rejects.toThrow("cannot be undefined");
  });

  it("publishes committed provider changes through one shared subscription", async () => {
    const h = harness();
    const preferences = await createPreferences(h.storage, h.events);
    const listener = vi.fn();
    const unsubscribe = preferences.subscribe(listener);

    await preferences.set("zoomLevel", 1.25);
    expect(listener).toHaveBeenCalledExactlyOnceWith("zoomLevel", 1.25);

    unsubscribe();
    await preferences.set("zoomLevel", 1.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
