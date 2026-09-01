// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  logs: vi.fn(async (_r: string, _id: string, tail?: number) => `tail=${tail}`),
}));
vi.mock("./lib/native", () => ({ containersNative: native }));

import { useContainerLogs } from "./useContainerDetail";

beforeEach(() => {
  vi.useFakeTimers();
  native.logs.mockClear();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useContainerLogs", () => {
  it("requests the given tail and re-fetches when it changes", async () => {
    const { rerender } = renderHook(
      ({ tail }) => useContainerLogs("docker", "c1", true, true, tail, true),
      { initialProps: { tail: 200 } },
    );
    await vi.waitFor(() =>
      expect(native.logs).toHaveBeenCalledWith("docker", "c1", 200),
    );
    rerender({ tail: 1000 });
    await vi.waitFor(() =>
      expect(native.logs).toHaveBeenCalledWith("docker", "c1", 1000),
    );
  });

  it("polls on an interval while following, and stops when paused", async () => {
    const { rerender } = renderHook(
      ({ follow }) => useContainerLogs("docker", "c1", true, true, 200, follow),
      { initialProps: { follow: true } },
    );
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(native.logs.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Pause follow: one final fetch on the dependency change, then no interval.
    native.logs.mockClear();
    rerender({ follow: false });
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(native.logs).toHaveBeenCalledTimes(1); // frozen — no more polling
  });

  it("does not poll a stopped or background container", async () => {
    renderHook(() => useContainerLogs("docker", "c1", false, true, 200, true));
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(native.logs).toHaveBeenCalledTimes(1); // fetched once, no interval
  });

  it("does NOT follow by default (static one-shot, no interval)", async () => {
    // follow omitted → defaults to false even for a running+active container.
    renderHook(() => useContainerLogs("docker", "c1", true, true, 200));
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(native.logs).toHaveBeenCalledTimes(1); // no polling without follow
  });

  it("re-pulls when the reloadKey changes (manual refresh)", async () => {
    const { rerender } = renderHook(
      ({ key }) =>
        useContainerLogs("docker", "c1", true, true, 1000, false, key),
      { initialProps: { key: 0 } },
    );
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(1));
    rerender({ key: 1 });
    await vi.waitFor(() => expect(native.logs).toHaveBeenCalledTimes(2));
    expect(native.logs).toHaveBeenLastCalledWith("docker", "c1", 1000);
  });
});
