import { describe, expect, it, vi } from "vitest";
import { createSourceControlSectionRegistry } from "./sectionRegistry";

const Component = () => null;

describe("Source Control section registry", () => {
  it("sorts sections and publishes registration lifecycle changes", () => {
    const registry = createSourceControlSectionRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const disposeLater = registry.register(
      { id: "later", label: "Later", order: 20, Component },
      { pluginId: "test", generation: "1", key: "later" },
    );
    registry.register(
      { id: "reviews", label: "Reviews", order: 10, Component },
      { pluginId: "test", generation: "1", key: "reviews" },
    );

    expect(registry.snapshot().map((entry) => entry.id)).toEqual(["reviews", "later"]);
    expect(listener).toHaveBeenCalledTimes(2);
    disposeLater();
    expect(registry.snapshot().map((entry) => entry.id)).toEqual(["reviews"]);
  });

  it("rejects duplicate ids", () => {
    const registry = createSourceControlSectionRegistry();
    registry.register(
      { id: "reviews", label: "Reviews", Component },
      { pluginId: "first", generation: "1", key: "reviews" },
    );
    expect(() => registry.register(
      { id: "reviews", label: "Reviews", Component },
      { pluginId: "second", generation: "1", key: "reviews" },
    )).toThrow("already registered");
  });
});
