import { describe, expect, it, vi } from "vitest";
import { createContributionRegistry } from "./contributionRegistry";

describe("createContributionRegistry", () => {
  it("keeps registration order and removes only the disposed entry", () => {
    const registry = createContributionRegistry<{ id: string }>();
    const changed = vi.fn();
    registry.subscribe(changed);

    const removeFirst = registry.register({ id: "first" });
    registry.register({ id: "second" });
    removeFirst();
    removeFirst();

    expect(registry.snapshot()).toEqual([{ id: "second" }]);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate ids and retains first-seen rank across reload", () => {
    const registry = createContributionRegistry<{ id: string }>();
    const removeFirst = registry.register({ id: "first" });
    registry.register({ id: "second" });

    expect(() => registry.register({ id: "second" })).toThrow(
      'registry entry "second" is already registered',
    );
    removeFirst();
    registry.register({ id: "first" });

    expect(registry.snapshot().map((entry) => entry.id)).toEqual([
      "first",
      "second",
    ]);
  });
});
