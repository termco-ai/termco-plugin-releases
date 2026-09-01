import { describe, expect, it, vi } from "vitest";
import { SurfaceSearchRegistry } from "./searchRegistry";

function target(kind: "terminal" | "editor" | "git-history") {
  return { kind } as never;
}

describe("ui.surface-search provider", () => {
  it("keeps independent search targets for split-pane tabs", () => {
    const registry = new SurfaceSearchRegistry();
    const left = target("terminal");
    const right = target("editor");
    registry.register(1, left);
    registry.register(2, right);
    expect(registry.target(1)).toBe(left);
    expect(registry.target(2)).toBe(right);
  });

  it("publishes registration and removal", () => {
    const registry = new SurfaceSearchRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const dispose = registry.register(1, target("git-history"));
    dispose();
    unsubscribe();
    registry.register(2, target("editor"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale surface cleanup remove its replacement", () => {
    const registry = new SurfaceSearchRegistry();
    const first = target("terminal");
    const second = target("editor");
    const unregisterFirst = registry.register(1, first);
    registry.register(1, second);
    unregisterFirst();
    expect(registry.target(1)).toBe(second);
  });
});
