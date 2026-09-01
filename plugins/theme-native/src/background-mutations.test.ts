// @vitest-environment jsdom
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { beforeEach, describe, expect, it, vi } from "vitest";

const background = vi.hoisted(() => ({
  importBackground: vi.fn(async () => "image-new"),
  deleteBackground: vi.fn(async () => {}),
  getBackground: vi.fn(async () => null),
}));

vi.mock("./background", () => background);

import { createThemeCapability } from "./renderer";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});

function harness(initial: Record<string, unknown>, fail?: (key: string, value: unknown) => boolean) {
  const values = new Map(Object.entries(initial));
  const set = vi.fn(async (key: string, value: unknown) => {
    if (fail?.(key, value)) throw new Error(`cannot persist ${key}`);
    values.set(key, value);
  });
  const preferences = {
    get: async <T,>(key: string) => values.get(key) as T | undefined,
    getMany: async (keys: readonly string[]) => Object.fromEntries(
      keys.filter((key) => values.has(key)).map((key) => [key, values.get(key)]),
    ),
    set,
    delete: async (key: string) => values.delete(key),
    subscribe: () => () => {},
  } as PreferencesCapability;
  const events = {
    emit: vi.fn(async () => {}),
    subscribe: () => () => {},
    subscribeAll: () => () => {},
    listenerCount: () => 0,
  } as unknown as ApplicationEventsCapability;
  return { values, set, preferences, events };
}

describe("ui.theme background mutation transaction", () => {
  it("imports, persists, publishes, and deletes the replaced image only after success", async () => {
    const test = harness({ backgroundKind: "image", backgroundImageId: "image-old" });
    const capability = await createThemeCapability(test.preferences, test.events);
    const file = new File(["image"], "wallpaper.png", { type: "image/png" });

    await expect(capability.mutate({ type: "import-background", file })).resolves.toEqual({ imageId: "image-new" });
    expect(background.importBackground).toHaveBeenCalledWith(file);
    expect(test.values.get("backgroundImageId")).toBe("image-new");
    expect(test.values.get("backgroundKind")).toBe("image");
    expect(capability.snapshot().background).toMatchObject({ kind: "image", imageId: "image-new" });
    expect(background.deleteBackground).toHaveBeenCalledWith("image-old");
  });

  it("rolls back snapshot, persisted fields, and the newly imported blob after a partial import failure", async () => {
    const test = harness(
      { backgroundKind: "none", backgroundImageId: null },
      (key, value) => key === "backgroundKind" && value === "image",
    );
    const capability = await createThemeCapability(test.preferences, test.events);
    const file = new File(["image"], "wallpaper.png", { type: "image/png" });

    await expect(capability.mutate({ type: "import-background", file })).rejects.toThrow("cannot persist backgroundKind");
    expect(capability.snapshot().background).toMatchObject({ kind: "none", imageId: null });
    expect(test.values.get("backgroundImageId")).toBeNull();
    expect(test.values.get("backgroundKind")).toBe("none");
    expect(background.deleteBackground).toHaveBeenCalledWith("image-new");
  });

  it("rolls back a partially persisted removal and keeps the stored image", async () => {
    const test = harness(
      { backgroundKind: "image", backgroundImageId: "image-old" },
      (key, value) => key === "backgroundImageId" && value === null,
    );
    const capability = await createThemeCapability(test.preferences, test.events);

    await expect(capability.mutate({ type: "remove-background" })).rejects.toThrow("cannot persist backgroundImageId");
    expect(capability.snapshot().background).toMatchObject({ kind: "image", imageId: "image-old" });
    expect(test.values.get("backgroundKind")).toBe("image");
    expect(test.values.get("backgroundImageId")).toBe("image-old");
    expect(background.deleteBackground).not.toHaveBeenCalled();
  });
});
