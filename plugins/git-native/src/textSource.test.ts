/**
 * Reading the working copy — and from WHICH machine.
 *
 * The bug this file exists for: `readTextFile` used `node:fs` unconditionally.
 * On an SSH rig the old side of a diff came from `git show` (correctly routed to
 * the remote) while the new side was read from the Mac, where `/home/user/…`
 * does not exist. ENOENT became `missing`, `intoText` turned that into an empty
 * string, and the merge view faithfully rendered "the whole file was deleted".
 *
 * Nothing about that looked like an error, which is why it took a screenshot to
 * find.
 */

import type { WorkspaceFilesCapability } from "@termco/files-base";
import type {
  WorkspaceCapability,
  WorkspaceEnv,
  WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());

const lstatSync = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:fs", () => {
  const mocked = {
    lstatSync,
    readFileSync,
    realpathSync: (path: string) => path,
  };
  return { ...mocked, default: mocked };
});

import { configureGitRuntime } from "./runtime";
import { intoText, readTextFile } from "./textSource";

const SSH = { kind: "ssh", connectionId: "c1" } as unknown as WorkspaceEnv;
const LOCAL = { kind: "local" } as unknown as WorkspaceEnv;

beforeEach(() => {
  vi.clearAllMocks();
  configureGitRuntime({
    workspace: { authorize: (path: string) => path } as unknown as WorkspaceCapability,
    execution: {} as WorkspaceExecutionCapability,
    files: { readFile } as unknown as WorkspaceFilesCapability,
  });
});

describe("readTextFile on an SSH rig", () => {
  /** The regression test. Reading locally is what produced the phantom deletion. */
  it("reads from the remote, not from this machine", async () => {
    readFile.mockResolvedValue({ kind: "text", content: "hello", size: 5 });

    const res = await readTextFile(SSH, "/home/user/repo/a.ts");

    expect(res).toEqual({ kind: "text", text: "hello" });
    expect(readFile).toHaveBeenCalledWith("/home/user/repo/a.ts", SSH, true);
    expect(lstatSync, "must never touch the local filesystem").not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("maps a binary file", async () => {
    readFile.mockResolvedValue({ kind: "binary", size: 999 });
    expect(await readTextFile(SSH, "/home/user/x.png")).toEqual({ kind: "binary" });
  });

  // A file too big to diff takes the same route as a binary one: the caller
  // turns that into the patch fallback, which is the right view for it.
  it("treats an oversized file like a binary one", async () => {
    readFile.mockResolvedValue({ kind: "toolarge", size: 99e6, limit: 1e6 });
    expect(await readTextFile(SSH, "/home/user/huge.log")).toEqual({ kind: "binary" });
  });

  it("reports a missing file as missing, not as empty", async () => {
    readFile.mockResolvedValue({ kind: "missing" });
    expect(await readTextFile(SSH, "/home/user/gone.ts")).toEqual({ kind: "missing" });
  });

  // The remote throws for a path that is not there; an unreachable rig throws
  // too. Both are "not available" — neither is "the file is empty".
  it("survives the remote throwing", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));
    expect(await readTextFile(SSH, "/home/user/gone.ts")).toEqual({ kind: "missing" });
  });
});

describe("readTextFile locally", () => {
  it("still reads from disk", async () => {
    lstatSync.mockReturnValue({
      isSymbolicLink: () => false,
      isFile: () => true,
    });
    readFileSync.mockReturnValue(Buffer.from("local text"));

    const res = await readTextFile(LOCAL, "/tmp/a.ts");

    expect(res).toEqual({ kind: "text", text: "local text" });
    expect(readFile, "must not reach for the network").not.toHaveBeenCalled();
  });

  it("reports a missing file as missing", async () => {
    lstatSync.mockImplementation(() => {
      throw Object.assign(new Error("nope"), { code: "ENOENT" });
    });
    expect(await readTextFile(LOCAL, "/tmp/gone.ts")).toEqual({ kind: "missing" });
  });

  // Local-only hardening: the remote read follows symlinks, like the rest of
  // the app's fs path. Kept deliberately, so the difference is visible here.
  it("rejects a symlink", async () => {
    lstatSync.mockReturnValue({
      isSymbolicLink: () => true,
      isFile: () => false,
    });
    await expect(readTextFile(LOCAL, "/tmp/link")).rejects.toThrow(/symlink/);
  });

  it("detects binary content by a null byte", async () => {
    lstatSync.mockReturnValue({
      isSymbolicLink: () => false,
      isFile: () => true,
    });
    readFileSync.mockReturnValue(Buffer.from([0x41, 0x00, 0x42]));
    expect(await readTextFile(LOCAL, "/tmp/x.bin")).toEqual({ kind: "binary" });
  });
});

describe("intoText", () => {
  /**
   * This flattening is fine — as long as the REASON travels alongside it.
   * It used to be the only thing the caller had, which is what made a failed
   * read indistinguishable from an empty file.
   */
  it("flattens every non-text source to an empty string", () => {
    expect(intoText({ kind: "text", text: "x" })).toBe("x");
    expect(intoText({ kind: "missing" })).toBe("");
    expect(intoText({ kind: "binary" })).toBe("");
  });
});
