// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBlockController } from "./blockController";
import {
  getLeafBlockMode,
  interruptLeaf,
  leafCwd,
  submitToLeaf,
  subscribeLeafBlockMode,
} from "./useTerminalSession";

vi.mock("./useTerminalSession", () => ({
  getLeafBlockMode: vi.fn(() => "prompt"),
  interruptLeaf: vi.fn(),
  leafCwd: vi.fn(() => "/cwd"),
  submitToLeaf: vi.fn(),
  subscribeLeafBlockMode: vi.fn(() => () => {}),
}));

const getMode = vi.mocked(getLeafBlockMode);
const subscribe = vi.mocked(subscribeLeafBlockMode);

beforeEach(() => {
  vi.clearAllMocks();
  getMode.mockReturnValue("prompt");
  subscribe.mockReturnValue(() => {});
});

describe("useBlockController", () => {
  it("returns null without a leaf", () => {
    const { result } = renderHook(() => useBlockController(null));
    expect(result.current).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("exposes the current block mode and delegates actions", () => {
    getMode.mockReturnValue("running");
    const { result } = renderHook(() => useBlockController(7));
    expect(result.current?.blockMode).toBe("running");

    result.current?.submitCommand("make");
    expect(submitToLeaf).toHaveBeenCalledWith(7, "make");

    result.current?.interrupt();
    expect(interruptLeaf).toHaveBeenCalledWith(7);

    expect(result.current?.getCwd()).toBe("/cwd");
    expect(leafCwd).toHaveBeenCalledWith(7);
  });

  it("updates when the subscribed mode changes", () => {
    let notify: (() => void) | null = null;
    subscribe.mockImplementation((_leafId, cb) => {
      notify = cb;
      return () => {};
    });
    const { result } = renderHook(() => useBlockController(3));
    expect(result.current?.blockMode).toBe("prompt");
    getMode.mockReturnValue("running");
    act(() => notify?.());
    expect(result.current?.blockMode).toBe("running");
  });

  it("unsubscribes and resubscribes when the leaf changes", () => {
    const unsub = vi.fn();
    subscribe.mockReturnValue(unsub);
    const { rerender } = renderHook(
      ({ leafId }: { leafId: number | null }) => useBlockController(leafId),
      { initialProps: { leafId: 1 } },
    );
    expect(subscribe).toHaveBeenCalledWith(1, expect.any(Function));
    rerender({ leafId: 2 });
    expect(unsub).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("keeps a stable controller identity while inputs are unchanged", () => {
    const { result, rerender } = renderHook(() => useBlockController(4));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
