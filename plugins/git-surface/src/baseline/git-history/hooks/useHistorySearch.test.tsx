// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitHistorySearchHandle } from "../types";
import { useHistorySearch } from "./useHistorySearch";

afterEach(() => {
  cleanup();
});

describe("useHistorySearch", () => {
  it("starts with an empty active search", () => {
    const { result } = renderHook(() => useHistorySearch());
    expect(result.current).toBe("");
  });

  it("registers a handle and unregisters it on unmount", () => {
    const onSearchHandle = vi.fn();
    const { unmount } = renderHook(() => useHistorySearch(onSearchHandle));
    expect(onSearchHandle).toHaveBeenCalledTimes(1);
    const handle = onSearchHandle.mock.calls[0][0] as GitHistorySearchHandle;
    expect(typeof handle.setQuery).toBe("function");
    expect(typeof handle.clearQuery).toBe("function");
    unmount();
    expect(onSearchHandle).toHaveBeenLastCalledWith(null);
  });

  it("activates queries of at least two characters", async () => {
    const onSearchHandle = vi.fn();
    const { result } = renderHook(() => useHistorySearch(onSearchHandle));
    const handle = onSearchHandle.mock.calls[0][0] as GitHistorySearchHandle;
    await act(async () => {
      handle.setQuery("fix bug");
    });
    expect(result.current).toBe("fix bug");
  });

  it("suppresses single-character queries", async () => {
    const onSearchHandle = vi.fn();
    const { result } = renderHook(() => useHistorySearch(onSearchHandle));
    const handle = onSearchHandle.mock.calls[0][0] as GitHistorySearchHandle;
    await act(async () => {
      handle.setQuery("f");
    });
    expect(result.current).toBe("");
  });

  it("trims whitespace before measuring the query", async () => {
    const onSearchHandle = vi.fn();
    const { result } = renderHook(() => useHistorySearch(onSearchHandle));
    const handle = onSearchHandle.mock.calls[0][0] as GitHistorySearchHandle;
    await act(async () => {
      handle.setQuery("  a  ");
    });
    expect(result.current).toBe("");
    await act(async () => {
      handle.setQuery("  ab  ");
    });
    expect(result.current).toBe("ab");
  });

  it("clearQuery resets the active search", async () => {
    const onSearchHandle = vi.fn();
    const { result } = renderHook(() => useHistorySearch(onSearchHandle));
    const handle = onSearchHandle.mock.calls[0][0] as GitHistorySearchHandle;
    await act(async () => {
      handle.setQuery("query");
    });
    expect(result.current).toBe("query");
    await act(async () => {
      handle.clearQuery();
    });
    expect(result.current).toBe("");
  });
});
