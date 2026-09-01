import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import { configurePlatformRuntime, LazyStore } from "./platform";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("ai-chat application storage", () => {
  it("persists plugin state through storage.application", async () => {
    const values = new Map<string, unknown>();
    const save = vi.fn(async () => {});
    const handle = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      set: (key: string, value: unknown) => values.set(key, value),
      has: (key: string) => values.has(key),
      delete: (key: string) => values.delete(key),
      keys: () => [...values.keys()],
      values: () => [...values.values()],
      entries: () => [...values.entries()],
      clear: () => values.clear(),
      reset: () => values.clear(),
      save,
    } as unknown as StorageHandle;
    const open = vi.fn(async () => handle);
    dispose = configurePlatformRuntime({
      storage: { open } as unknown as StorageCapability,
      events: {} as ApplicationEventsCapability,
    });

    const store = new LazyStore("chat-state.json");
    await store.set("selected", "session-1");

    await expect(store.get("selected")).resolves.toBe("session-1");
    expect(open).toHaveBeenCalledWith("chat-state.json", {});
    expect(save).toHaveBeenCalledOnce();
  });
});
