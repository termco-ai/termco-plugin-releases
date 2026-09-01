// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const historyList = vi.fn();
const history = { list: historyList } as unknown as ShellHistoryCapability;
const workspace = { kind: "local" } as const;

import { useCommandHistory } from "./useCommandHistory";

beforeEach(() => {
  vi.useFakeTimers();
  historyList.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

afterEach(cleanup);

describe("useCommandHistory", () => {
  it("queries history with the term and a limit", async () => {
    historyList.mockResolvedValue(["ls", "pwd"]);
    const { result } = renderHook(() =>
      useCommandHistory("l", true, history, workspace),
    );
    await flush();
    expect(historyList).toHaveBeenCalledWith("l", 60, workspace);
    expect(result.current.results).toEqual(["ls", "pwd"]);
  });

  it("deduplicates repeated history entries", async () => {
    historyList.mockResolvedValue(["ls", "ls", "pwd", "ls"]);
    const { result } = renderHook(() =>
      useCommandHistory("", true, history, workspace),
    );
    await flush();
    expect(result.current.results).toEqual(["ls", "pwd"]);
  });

  it("does not query when disabled", async () => {
    historyList.mockResolvedValue(["ls"]);
    renderHook(() => useCommandHistory("ls", false, history, workspace));
    await flush();
    expect(historyList).not.toHaveBeenCalled();
  });

  it("surfaces history errors", async () => {
    historyList.mockRejectedValue(new Error("no shell"));
    const { result } = renderHook(() =>
      useCommandHistory("x", true, history, workspace),
    );
    await flush();
    expect(result.current.error).toContain("no shell");
  });
});
