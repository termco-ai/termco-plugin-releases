// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const grepInteractive = vi.fn();
const files = { grepInteractive } as unknown as WorkspaceFilesCapability;
const workspace = { kind: "local" } as const;

import { useContentSearch } from "./useContentSearch";

beforeEach(() => {
  vi.useFakeTimers();
  grepInteractive.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

const HIT = { path: "/repo/src/a.ts", rel: "src/a.ts", line: 3, text: "foo" };

afterEach(cleanup);

describe("useContentSearch", () => {
  it("greps the workspace root with the query", async () => {
    grepInteractive.mockResolvedValue({ hits: [HIT], truncated: false });
    const { result } = renderHook(() =>
      useContentSearch("/repo", "foo", true, files, workspace),
    );
    await flush();
    expect(grepInteractive).toHaveBeenCalledWith(
      { pattern: "foo", root: "/repo", maxResults: 80 },
      workspace,
    );
    expect(result.current.results).toEqual([HIT]);
  });

  it("requires at least two characters", async () => {
    grepInteractive.mockResolvedValue({ hits: [HIT] });
    const { result } = renderHook(() =>
      useContentSearch("/repo", "f", true, files, workspace),
    );
    await flush();
    expect(grepInteractive).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("is disabled without a workspace root", async () => {
    grepInteractive.mockResolvedValue({ hits: [HIT] });
    renderHook(() => useContentSearch(null, "foo", true, files, workspace));
    await flush();
    expect(grepInteractive).not.toHaveBeenCalled();
  });

  it("is disabled when the mode is inactive", async () => {
    grepInteractive.mockResolvedValue({ hits: [HIT] });
    renderHook(() =>
      useContentSearch("/repo", "foo", false, files, workspace),
    );
    await flush();
    expect(grepInteractive).not.toHaveBeenCalled();
  });

  it("reports grep failures", async () => {
    grepInteractive.mockRejectedValue("ripgrep exploded");
    const { result } = renderHook(() =>
      useContentSearch("/repo", "foo", true, files, workspace),
    );
    await flush();
    expect(result.current.error).toContain("ripgrep exploded");
  });
});
