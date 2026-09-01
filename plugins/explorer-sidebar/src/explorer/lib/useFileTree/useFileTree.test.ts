// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { listenFsChanged, watchAdd, watchRemove } from "../watch";
import type { DirEntry } from "./types";
import { useFileTree } from "./useFileTree";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../../testRuntime";

const LOCAL: WorkspaceEnv = { kind: "local" };

vi.mock("../watch", () => ({
  watchAdd: vi.fn(),
  watchRemove: vi.fn(),
  listenFsChanged: vi.fn(() => Promise.resolve(() => {})),
}));

function entry(
  name: string,
  kind: DirEntry["kind"] = "file",
  gitignored = false,
): DirEntry {
  return { name, kind, size: 0, mtime: 0, gitignored };
}

type Listing = Record<string, DirEntry[]>;
let runtime: ExplorerRuntimeMocks;

function mockFs(listing: Listing) {
  runtime.files.readDir.mockImplementation((path) => {
    const entries = listing[path];
    if (!entries) return Promise.reject(new Error("not found"));
    return Promise.resolve(entries);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  vi.mocked(listenFsChanged).mockResolvedValue(() => {});
});

describe("useFileTree", () => {
  it("loads the root listing and watches the root", async () => {
    mockFs({ "/ws": [entry("src", "dir"), entry("a.ts")] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    expect(runtime.files.readDir).toHaveBeenCalledWith(
      "/ws",
      false,
      true,
      { kind: "local" },
    );
    expect(watchAdd).toHaveBeenCalledWith(["/ws"], LOCAL);
  });

  it("tears everything down for a null root", () => {
    const { result } = renderHook(() => useFileTree(null, LOCAL));
    expect(result.current.nodes).toEqual({});
    expect(result.current.expanded.size).toBe(0);
    expect(runtime.files.readDir).not.toHaveBeenCalled();
  });

  it("records an error state when the listing fails", async () => {
    mockFs({});
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("error");
    });
    const node = result.current.nodes["/ws"];
    expect(node.status === "error" && node.message).toContain("not found");
  });

  it("toggle expands a directory, fetches it, and collapses again", async () => {
    mockFs({
      "/ws": [entry("src", "dir")],
      "/ws/src": [entry("b.ts")],
    });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });

    act(() => result.current.toggle("/ws/src"));
    await waitFor(() => {
      expect(result.current.nodes["/ws/src"]?.status).toBe("loaded");
    });
    expect(result.current.expanded.has("/ws/src")).toBe(true);
    expect(watchAdd).toHaveBeenCalledWith(["/ws/src"], LOCAL);

    act(() => result.current.toggle("/ws/src"));
    expect(result.current.expanded.has("/ws/src")).toBe(false);
    expect(watchRemove).toHaveBeenCalledWith(["/ws/src"], LOCAL);
  });

  it("expand is idempotent", async () => {
    mockFs({ "/ws": [entry("src", "dir")], "/ws/src": [] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.expand("/ws/src"));
    act(() => result.current.expand("/ws/src"));
    expect(result.current.expanded.has("/ws/src")).toBe(true);
    expect(
      runtime.files.readDir.mock.calls.filter(([path]) => path === "/ws/src"),
    ).toHaveLength(1);
  });

  it("prunes state for directories that disappear from a fresh listing", async () => {
    const listing: Listing = {
      "/ws": [entry("src", "dir")],
      "/ws/src": [entry("b.ts")],
    };
    mockFs(listing);
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.toggle("/ws/src"));
    await waitFor(() => {
      expect(result.current.nodes["/ws/src"]?.status).toBe("loaded");
    });

    listing["/ws"] = [entry("other", "dir")];
    act(() => result.current.refresh("/ws"));
    await waitFor(() => {
      expect(result.current.nodes["/ws/src"]).toBeUndefined();
    });
    expect(result.current.expanded.has("/ws/src")).toBe(false);
    expect(watchRemove).toHaveBeenCalledWith(["/ws/src"], LOCAL);
  });

  it("commitCreate invokes fs_create_file and refetches the parent", async () => {
    mockFs({ "/ws": [entry("a.ts")] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });

    act(() => result.current.beginCreate("/ws", "file"));
    expect(result.current.pendingCreate).toEqual({
      parentPath: "/ws",
      kind: "file",
    });
    await act(() => result.current.commitCreate("new.ts"));
    expect(runtime.files.createFile).toHaveBeenCalledWith(
      "/ws/new.ts",
      { kind: "local" },
    );
    expect(result.current.pendingCreate).toBeNull();
  });

  it("commitCreate with a dir kind uses fs_create_dir", async () => {
    mockFs({ "/ws": [] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.beginCreate("/ws", "dir"));
    await act(() => result.current.commitCreate("nested"));
    expect(runtime.files.createDir).toHaveBeenCalledWith(
      "/ws/nested",
      { kind: "local" },
    );
  });

  it("commitCreate with a blank name just clears the pending state", async () => {
    mockFs({ "/ws": [] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.beginCreate("/ws", "file"));
    await act(() => result.current.commitCreate("   "));
    expect(result.current.pendingCreate).toBeNull();
    expect(runtime.files.createFile).not.toHaveBeenCalled();
  });

  it("beginCreate on a collapsed subdirectory expands and loads it", async () => {
    mockFs({ "/ws": [entry("src", "dir")], "/ws/src": [] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.beginCreate("/ws/src", "file"));
    expect(result.current.expanded.has("/ws/src")).toBe(true);
    await waitFor(() => {
      expect(result.current.nodes["/ws/src"]?.status).toBe("loaded");
    });
  });

  it("cancelCreate clears the pending state", async () => {
    mockFs({ "/ws": [] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    act(() => result.current.beginCreate("/ws", "file"));
    act(() => result.current.cancelCreate());
    expect(result.current.pendingCreate).toBeNull();
  });

  it("commitRename renames and notifies the callback", async () => {
    mockFs({ "/ws": [entry("a.ts")] });
    const onPathRenamed = vi.fn();
    const { result } = renderHook(() => useFileTree("/ws", LOCAL, { onPathRenamed }));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });

    act(() => result.current.beginRename("/ws/a.ts"));
    expect(result.current.renaming).toBe("/ws/a.ts");
    await act(() => result.current.commitRename("b.ts"));
    expect(runtime.files.rename).toHaveBeenCalledWith(
      "/ws/a.ts",
      "/ws/b.ts",
      { kind: "local" },
    );
    expect(onPathRenamed).toHaveBeenCalledWith("/ws/a.ts", "/ws/b.ts");
    expect(result.current.renaming).toBeNull();
  });

  it("commitRename to the same or empty name is a no-op", async () => {
    mockFs({ "/ws": [entry("a.ts")] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.beginRename("/ws/a.ts"));
    await act(() => result.current.commitRename("a.ts"));
    expect(result.current.renaming).toBeNull();
    act(() => result.current.beginRename("/ws/a.ts"));
    await act(() => result.current.commitRename("  "));
    expect(runtime.files.rename).not.toHaveBeenCalled();
  });

  it("deletePath deletes and notifies the callback", async () => {
    mockFs({ "/ws": [entry("a.ts")] });
    const onPathDeleted = vi.fn();
    const { result } = renderHook(() => useFileTree("/ws", LOCAL, { onPathDeleted }));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    await act(() => result.current.deletePath("/ws/a.ts"));
    expect(runtime.files.delete).toHaveBeenCalledWith(
      "/ws/a.ts",
      { kind: "local" },
    );
    expect(onPathDeleted).toHaveBeenCalledWith("/ws/a.ts");
  });

  it("movePath renames into the target directory", async () => {
    mockFs({
      "/ws": [entry("a.ts"), entry("src", "dir")],
      "/ws/src": [],
    });
    const onPathRenamed = vi.fn();
    const { result } = renderHook(() => useFileTree("/ws", LOCAL, { onPathRenamed }));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    await act(() => result.current.movePath("/ws/a.ts", "/ws/src"));
    expect(runtime.files.rename).toHaveBeenCalledWith(
      "/ws/a.ts",
      "/ws/src/a.ts",
      { kind: "local" },
    );
    expect(onPathRenamed).toHaveBeenCalledWith("/ws/a.ts", "/ws/src/a.ts");
  });

  it("movePath skips when the name already exists in the target", async () => {
    mockFs({
      "/ws": [entry("a.ts"), entry("src", "dir")],
      "/ws/src": [entry("a.ts")],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    act(() => result.current.toggle("/ws/src"));
    await waitFor(() => {
      expect(result.current.nodes["/ws/src"]?.status).toBe("loaded");
    });
    await act(() => result.current.movePath("/ws/a.ts", "/ws/src"));
    expect(runtime.files.rename).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("movePath into the same directory is a no-op", async () => {
    mockFs({ "/ws": [entry("a.ts")] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    await act(() => result.current.movePath("/ws/a.ts", "/ws"));
    expect(runtime.files.rename).not.toHaveBeenCalled();
  });

  it("logs and clears state when mutations fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFs({ "/ws": [entry("a.ts")] });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });
    runtime.files.createFile.mockRejectedValue(new Error("io error"));
    runtime.files.rename.mockRejectedValue(new Error("io error"));
    runtime.files.delete.mockRejectedValue(new Error("io error"));

    act(() => result.current.beginCreate("/ws", "file"));
    await act(() => result.current.commitCreate("x.ts"));
    expect(result.current.pendingCreate).toBeNull();

    act(() => result.current.beginRename("/ws/a.ts"));
    await act(() => result.current.commitRename("b.ts"));
    expect(result.current.renaming).toBeNull();

    await act(() => result.current.deletePath("/ws/a.ts"));
    await act(() => result.current.movePath("/ws/a.ts", "/ws/sub"));

    expect(error).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });

  it("refetches loaded directories when the fs watcher reports changes", async () => {
    const listing: Listing = { "/ws": [entry("a.ts")] };
    mockFs(listing);
    let fsHandler: ((paths: string[]) => void) | undefined;
    vi.mocked(listenFsChanged).mockImplementation((h) => {
      fsHandler = h;
      return Promise.resolve(() => {});
    });
    const { result } = renderHook(() => useFileTree("/ws", LOCAL));
    await waitFor(() => {
      expect(result.current.nodes["/ws"]?.status).toBe("loaded");
    });

    listing["/ws"] = [entry("a.ts"), entry("fresh.ts")];
    act(() => fsHandler?.(["/ws/fresh.ts"]));
    await waitFor(() => {
      const node = result.current.nodes["/ws"];
      expect(node.status === "loaded" && node.entries).toHaveLength(2);
    });
  });

  it("remembers expansion per root and restores it on return", async () => {
    mockFs({
      "/ws1": [entry("src", "dir")],
      "/ws1/src": [entry("b.ts")],
      "/ws2": [],
    });
    const { result, rerender } = renderHook(
      ({ root }: { root: string }) => useFileTree(root, LOCAL),
      { initialProps: { root: "/ws1" } },
    );
    await waitFor(() => {
      expect(result.current.nodes["/ws1"]?.status).toBe("loaded");
    });
    act(() => result.current.toggle("/ws1/src"));
    await waitFor(() => {
      expect(result.current.nodes["/ws1/src"]?.status).toBe("loaded");
    });

    rerender({ root: "/ws2" });
    await waitFor(() => {
      expect(result.current.nodes["/ws2"]?.status).toBe("loaded");
    });
    expect(result.current.expanded.size).toBe(0);

    rerender({ root: "/ws1" });
    await waitFor(() => {
      expect(result.current.nodes["/ws1/src"]?.status).toBe("loaded");
    });
    expect(result.current.expanded.has("/ws1/src")).toBe(true);
  });
});
