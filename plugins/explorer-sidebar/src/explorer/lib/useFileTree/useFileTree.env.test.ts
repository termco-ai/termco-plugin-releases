// @vitest-environment jsdom
/**
 * Regression: the explorer must read/watch against the env PASSED to it (the
 * rig that owns `rootPath`), never the global `currentWorkspaceEnv()`. The
 * bug this pins: during a rig switch the global env flips to ssh a render
 * before `rootPath` catches up, so a call-time global read shipped the previous
 * rig's LOCAL path to the ssh remote → `ENOENT scandir '/Users/…'`.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { watchAdd } from "../watch";
import { useFileTree } from "./useFileTree";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../../testRuntime";

const SSH: WorkspaceEnv = { kind: "ssh", connectionId: "c1", host: "h" };

vi.mock("../watch", () => ({
  watchAdd: vi.fn(),
  watchRemove: vi.fn(),
  listenFsChanged: vi.fn(() => Promise.resolve(() => {})),
}));

let runtime: ExplorerRuntimeMocks;

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  runtime.files.readDir.mockResolvedValue([]);
});

describe("useFileTree threads the passed env, not the global", () => {
  it("reads fs_read_dir and watches with the SSH env", async () => {
    renderHook(() => useFileTree("/root", SSH));

    await waitFor(() =>
      expect(runtime.files.readDir).toHaveBeenCalledWith(
        "/root",
        false,
        true,
        SSH,
      ),
    );
    expect(watchAdd).toHaveBeenCalledWith(["/root"], SSH);
  });

  it("skips a stale path that is not under the current root (no wrong-backend read)", async () => {
    // Simulate the switch window: root is the remote /root, but a background
    // driver fires fetchChildren for the previous rig's local path. The
    // stale-scope guard must skip it — no invoke for the local path.
    const { result } = renderHook(() => useFileTree("/root", SSH));
    await waitFor(() =>
      expect(result.current.nodes["/root"]?.status).toBe("loaded"),
    );

    runtime.files.readDir.mockClear();
    // `refresh` calls fetchChildren directly with an out-of-scope local path.
    result.current.refresh("/Users/kevin/local-proj");
    await Promise.resolve();
    await Promise.resolve();

    const readLocal = runtime.files.readDir.mock.calls.some(
      ([path]) => path === "/Users/kevin/local-proj",
    );
    expect(readLocal).toBe(false);
  });
});
