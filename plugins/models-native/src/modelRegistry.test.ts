import { describe, expect, it, vi } from "vitest";
import { createModelRegistry } from "./modelRegistry";
import { MODEL_PROVIDERS } from "./renderer";

describe("createModelRegistry", () => {
  it("keeps snapshot identity stable until the registry changes", () => {
    const registry = createModelRegistry();

    const empty = registry.snapshot();
    expect(registry.snapshot()).toBe(empty);

    const remove = registry.register(MODEL_PROVIDERS[0]);
    const registered = registry.snapshot();
    expect(registered).not.toBe(empty);
    expect(registry.snapshot()).toBe(registered);

    remove();
    const removed = registry.snapshot();
    expect(removed).not.toBe(registered);
    expect(registry.snapshot()).toBe(removed);
  });

  it("preserves provider order and unregisters by identity", () => {
    const registry = createModelRegistry();
    const changed = vi.fn();
    registry.subscribe(changed);
    const removeOpenAi = registry.register(MODEL_PROVIDERS[0]);
    registry.register(MODEL_PROVIDERS[1]);

    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
    ]);
    removeOpenAi();
    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      "anthropic",
    ]);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate ids and retains first-seen rank across reload", () => {
    const registry = createModelRegistry();
    const removeOpenAi = registry.register(MODEL_PROVIDERS[0]);
    registry.register(MODEL_PROVIDERS[1]);

    expect(() => registry.register(MODEL_PROVIDERS[1])).toThrow(
      'registry entry "anthropic" is already registered',
    );
    removeOpenAi();
    registry.register(MODEL_PROVIDERS[0]);

    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
    ]);
  });
});
