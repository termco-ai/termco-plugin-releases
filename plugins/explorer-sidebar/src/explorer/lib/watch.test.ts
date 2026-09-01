import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { listenFsChanged, parentDir, watchAdd, watchRemove } from "./watch";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

const LOCAL: WorkspaceEnv = { kind: "local" };

let runtime: ExplorerRuntimeMocks;

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
});

describe("watchAdd", () => {
  it("invokes fs_watch_add with the workspace env", () => {
    watchAdd(["/a", "/b"], LOCAL);
    expect(runtime.files.watchAdd).toHaveBeenCalledWith(
      ["/a", "/b"],
      { kind: "local" },
    );
  });

  it("is a no-op for an empty list", () => {
    watchAdd([], LOCAL);
    expect(runtime.files.watchAdd).not.toHaveBeenCalled();
  });

  it("swallows invoke failures", async () => {
    runtime.files.watchAdd.mockRejectedValue(new Error("gone"));
    watchAdd(["/a"], LOCAL);
    await Promise.resolve();
  });
});

describe("watchRemove", () => {
  it("invokes fs_watch_remove", () => {
    watchRemove(["/a"], LOCAL);
    expect(runtime.files.watchRemove).toHaveBeenCalledWith(
      ["/a"],
      { kind: "local" },
    );
  });

  it("is a no-op for an empty list", () => {
    watchRemove([], LOCAL);
    expect(runtime.files.watchRemove).not.toHaveBeenCalled();
  });
});

describe("listenFsChanged", () => {
  it("subscribes to fs:changed and unwraps the payload", async () => {
    const handler = vi.fn();
    const un = await listenFsChanged(handler);
    runtime.events.emit("fs:changed", { paths: ["/x", "/y"] });
    expect(handler).toHaveBeenCalledWith(["/x", "/y"]);
    un();
    runtime.events.emit("fs:changed", { paths: ["/z"] });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("parentDir", () => {
  it("returns the parent of a unix path", () => {
    expect(parentDir("/a/b/c")).toBe("/a/b");
  });

  it("returns / for top-level paths", () => {
    expect(parentDir("/a")).toBe("/");
  });

  it("returns the input when there is no separator", () => {
    expect(parentDir("plain")).toBe("plain");
  });

  it("handles windows backslash paths", () => {
    expect(parentDir("C:\\Users\\foo")).toBe("C:\\Users");
  });
});
