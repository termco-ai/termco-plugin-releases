// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAsyncQuery } from "./useAsyncQuery";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

type Props = {
  enabled: boolean;
  term: string;
  run: (term: string) => Promise<string[]>;
};

function setup(initial: Partial<Props> = {}) {
  const run = initial.run ?? vi.fn(async (q: string) => [`hit:${q}`]);
  return renderHook(
    (props: Props) =>
      useAsyncQuery<string>({
        minLength: 2,
        debounceMs: 100,
        ...props,
      }),
    {
      initialProps: {
        enabled: true,
        term: "",
        run,
        ...initial,
      },
    },
  );
}

async function flush() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

afterEach(cleanup);

describe("useAsyncQuery", () => {
  it("stays idle below the minimum length", async () => {
    const run = vi.fn(async () => ["x"]);
    const { result } = setup({ term: "a", run });
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      results: [],
      loading: false,
      error: null,
    });
  });

  it("stays idle when disabled", async () => {
    const run = vi.fn(async () => ["x"]);
    setup({ term: "abc", enabled: false, run });
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("debounces before running and reports loading", async () => {
    const run = vi.fn(async (q: string) => [`hit:${q}`]);
    const { result } = setup({ term: "abc", run });
    expect(result.current.loading).toBe(true);
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(run).not.toHaveBeenCalled();
    await flush();
    expect(run).toHaveBeenCalledWith("abc");
    expect(result.current.results).toEqual(["hit:abc"]);
    expect(result.current.loading).toBe(false);
  });

  it("drops stale responses when the term changes mid-flight", async () => {
    const resolvers: Array<(v: string[]) => void> = [];
    const run = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, rerender } = setup({ term: "first", run });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ enabled: true, term: "second", run });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(resolvers).toHaveLength(2);
    // Resolve the requests out of order: the stale first result must lose.
    await act(async () => {
      resolvers[1](["second-hit"]);
      resolvers[0](["first-hit"]);
    });
    expect(result.current.results).toEqual(["second-hit"]);
  });

  it("captures errors and clears results", async () => {
    const run = vi.fn(async () => {
      throw new Error("grep failed");
    });
    const { result } = setup({ term: "abc", run });
    await flush();
    expect(result.current.error).toContain("grep failed");
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("retry re-runs the current term immediately", async () => {
    let fail = true;
    const run = vi.fn(async (q: string) => {
      if (fail) throw new Error("boom");
      return [`ok:${q}`];
    });
    const { result } = setup({ term: "abc", run });
    await flush();
    expect(result.current.error).not.toBeNull();

    fail = false;
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.results).toEqual(["ok:abc"]);
    expect(result.current.error).toBeNull();
  });

  it("retry does nothing when below the minimum length", async () => {
    const run = vi.fn(async () => ["x"]);
    const { result, rerender } = setup({ term: "abc", run });
    await flush();
    rerender({ enabled: true, term: "a", run });
    await flush();
    run.mockClear();
    act(() => {
      result.current.retry();
    });
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("clears results when the term drops below the minimum", async () => {
    const run = vi.fn(async (q: string) => [`hit:${q}`]);
    const { result, rerender } = setup({ term: "abc", run });
    await flush();
    expect(result.current.results).toEqual(["hit:abc"]);
    rerender({ enabled: true, term: "", run });
    expect(result.current.results).toEqual([]);
  });
});
