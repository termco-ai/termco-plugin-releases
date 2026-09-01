import { describe, expect, it, vi } from "vitest";
import { createActivityEventRegistry } from "./activityEventRegistry";

describe("activity event registry", () => {
  it("starts empty and publishes ordered registration changes", () => {
    const registry = createActivityEventRegistry();
    const changed = vi.fn();
    registry.subscribe(changed);

    expect(registry.snapshot()).toEqual([]);
    const removeFirst = registry.register({ id: "first" });
    registry.register({ id: "second" });
    removeFirst();
    removeFirst();
    registry.register({ id: "first" });

    expect(registry.snapshot().map((entry) => entry.id)).toEqual([
      "first",
      "second",
    ]);
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it("rejects simultaneously duplicated contribution ids", () => {
    const registry = createActivityEventRegistry();
    registry.register({ id: "review" });

    expect(() => registry.register({ id: "review" })).toThrow(
      'registry entry "review" is already registered',
    );
  });
});
