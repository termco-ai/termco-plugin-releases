// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceCapability, workspaceInternals } from "./workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true })));
});

async function directory(): Promise<string> {
  const path = await fs.mkdtemp(join(tmpdir(), "termco-workspace-plugin-"));
  roots.push(path);
  return path;
}

describe("workspace-native", () => {
  it("owns one authorization set shared by every consumer", async () => {
    const root = await directory();
    const nested = join(root, "nested");
    await fs.mkdir(nested);
    const workspace = createWorkspaceCapability({
      platform: "darwin",
      argv: ["electron", "app", root],
      home: root,
    });
    const canonicalRoot = await fs.realpath(root);
    const canonicalNested = await fs.realpath(nested);
    expect(workspace.currentDir()).toBe(canonicalRoot);
    expect(workspace.isAuthorized(canonicalNested)).toBe(true);
  });

  it("does not realpath remote SSH paths and fails closed for stale local paths", async () => {
    const root = await directory();
    const workspace = createWorkspaceCapability({
      platform: "linux",
      argv: ["electron", "app", root],
      home: root,
    });
    expect(
      workspace.authorize("/remote/home", {
        kind: "ssh",
        connectionId: "prod",
        host: "example.com",
      }),
    ).toBe("/remote/home");
    expect(workspace.authorize(join(root, "missing"), { kind: "local" })).toBe(
      join(root, "missing"),
    );
  });

  it("parses WSL output and rejects unsafe distro names", () => {
    expect(
      workspaceInternals.parseDistroList(
        "  NAME                   STATE           VERSION\n* Ubuntu 24.04          Running         2\n  Debian                Stopped         2\n",
      ),
    ).toEqual([
      { name: "Ubuntu 24.04", default: true, running: true },
      { name: "Debian", default: false, running: false },
    ]);
    expect(workspaceInternals.isSafeDistroName("Ubuntu-24.04")).toBe(true);
    expect(workspaceInternals.isSafeDistroName("../evil")).toBe(false);
  });

  it("normalizes Windows verbatim paths for display", async () => {
    const root = await directory();
    const workspace = createWorkspaceCapability({
      platform: "win32",
      argv: ["electron", "app", root],
      home: root,
    });
    expect(workspace.stripWindowsVerbatim("\\\\?\\C:\\work\\repo")).toBe(
      "C:/work/repo",
    );
    expect(
      workspace.stripWindowsVerbatim("\\\\?\\UNC\\server\\share\\repo"),
    ).toBe("//server/share/repo");
  });
});
