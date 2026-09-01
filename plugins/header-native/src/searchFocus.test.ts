import { describe, expect, it, vi } from "vitest";
import { HeaderSearchFocus } from "./searchFocus";

describe("ui.header-search provider", () => {
  it("focuses the currently mounted header input", () => {
    const search = new HeaderSearchFocus();
    const focus = vi.fn();
    const unregister = search.register(focus);
    search.focus();
    expect(focus).toHaveBeenCalledOnce();
    unregister();
    search.focus();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not let an old header unregister its replacement", () => {
    const search = new HeaderSearchFocus();
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = search.register(first);
    search.register(second);
    unregisterFirst();
    search.focus();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
