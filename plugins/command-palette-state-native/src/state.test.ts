import { describe, expect, it, vi } from "vitest";
import { createCommandPaletteState } from "./state";

describe("command palette state provider", () => {
  it("shares open mode and header placement through one capability", () => {
    const state = createCommandPaletteState();
    const listener = vi.fn();
    state.subscribe(listener);
    const anchor = {} as HTMLElement;
    state.setAnchor(anchor);
    state.show("content");
    expect(state.snapshot()).toMatchObject({
      open: true,
      mode: "content",
      query: "#",
      anchor,
    });
    state.setQuery("#needle");
    expect(state.snapshot().query).toBe("#needle");
    state.close();
    expect(state.snapshot().open).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
