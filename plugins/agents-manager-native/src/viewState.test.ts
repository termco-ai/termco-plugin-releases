import { describe, expect, it, vi } from "vitest";
import { createAgentsViewState } from "./viewState";

describe("ui.agents-view capability", () => {
  it("owns observable show, close, and toggle state", () => {
    const view = createAgentsViewState();
    const listener = vi.fn();
    const unsubscribe = view.subscribe(listener);

    view.show();
    expect(view.snapshot()).toMatchObject({ open: true, openSequence: 1 });
    view.close();
    expect(view.snapshot()).toMatchObject({ open: false, openSequence: 1 });
    view.toggle();
    expect(view.snapshot()).toMatchObject({ open: true, openSequence: 2 });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});
