// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBlockMeta } from "./useBlockMeta";

afterEach(cleanup);

const META = {
  id: "b1",
  command: "ls",
  cwd: "/root",
  exitCode: 0,
  startedAt: 1,
  finishedAt: 2,
  startLine: 0,
  endLine: 3,
  hiddenLeadingLines: 1,
};

function makeSession(initial: typeof META | null) {
  let meta = initial;
  const listeners = new Set<() => void>();
  return {
    session: {
      readBlockMeta: vi.fn(() => meta),
      subscribeBlocks: vi.fn((callback: () => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      }),
    },
    setMeta(next: typeof META | null) {
      meta = next;
    },
    fireViewport() {
      for (const callback of [...listeners]) callback();
    },
    listeners,
  };
}

describe("useBlockMeta", () => {
  it("returns meta immediately when readable at mount", () => {
    const { session } = makeSession(META);
    const { result } = renderHook(() => useBlockMeta(session, "b1"));
    expect(result.current).toEqual(META);
  });

  it("recovers from a null first read once the viewport signal fires (post-attach)", () => {
    const harness = makeSession(null);
    const { result } = renderHook(() => useBlockMeta(harness.session, "b1"));
    expect(result.current).toBeNull();
    harness.setMeta(META);
    act(() => harness.fireViewport());
    expect(result.current).toEqual(META);
  });

  it("stops listening after meta resolves (finished blocks are immutable)", () => {
    const harness = makeSession(null);
    const { result } = renderHook(() => useBlockMeta(harness.session, "b1"));
    harness.setMeta(META);
    act(() => harness.fireViewport());
    expect(result.current).toEqual(META);
    expect(harness.listeners.size).toBe(0);
    const settled = result.current;
    harness.setMeta({ ...META, command: "changed" });
    act(() => harness.fireViewport());
    expect(result.current).toBe(settled);
  });

  it("picks up meta in the mount effect when attach happened between render and effects", () => {
    const harness = makeSession(null);
    let reads = 0;
    harness.session.readBlockMeta.mockImplementation(() =>
      reads++ === 0 ? null : META,
    );
    const { result } = renderHook(() => useBlockMeta(harness.session, "b1"));
    expect(result.current).toEqual(META);
  });
});
