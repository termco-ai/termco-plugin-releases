// Kept with the source-owning terminal plugin.
import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalDropStore } from "./dropStore";

beforeEach(() => {
  useTerminalDropStore.getState().setTarget(null);
});

describe("useTerminalDropStore", () => {
  it("starts with no target", () => {
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
  });

  it("sets and clears the target leaf", () => {
    useTerminalDropStore.getState().setTarget(3);
    expect(useTerminalDropStore.getState().targetLeafId).toBe(3);
    useTerminalDropStore.getState().setTarget(null);
    expect(useTerminalDropStore.getState().targetLeafId).toBeNull();
  });

  it("does not emit a state change for a same-target update", () => {
    useTerminalDropStore.getState().setTarget(5);
    let notified = 0;
    const unsub = useTerminalDropStore.subscribe(() => {
      notified += 1;
    });
    useTerminalDropStore.getState().setTarget(5);
    expect(notified).toBe(0);
    useTerminalDropStore.getState().setTarget(6);
    expect(notified).toBe(1);
    unsub();
  });
});
