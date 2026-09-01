import { describe, expect, it, vi } from "vitest";
import { RigOverviewStore } from "./rigOverview";

describe("RigOverviewStore", () => {
  it("publishes visibility changes once and exposes the current snapshot", () => {
    const overview = new RigOverviewStore();
    const listener = vi.fn();
    overview.subscribe(listener);

    overview.setOpen(true);
    overview.setOpen(true);
    expect(overview.snapshot()).toEqual({ revision: 1, open: true });
    expect(listener).toHaveBeenCalledOnce();

    overview.setOpen(false);
    expect(overview.snapshot()).toEqual({ revision: 2, open: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
