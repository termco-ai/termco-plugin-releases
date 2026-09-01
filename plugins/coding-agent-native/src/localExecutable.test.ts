import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLocalExecutablePath,
  findExecutableOnPath,
} from "./localExecutable";

describe("local coding-agent executable discovery", () => {
  it.each(["claude", "codex"])("finds %s in ~/.local/bin when Electron has a restricted GUI PATH", (bin) => {
    const home = process.platform === "win32" ? "C:\\Users\\dev" : "/Users/dev";
    const guiPath = process.platform === "win32"
      ? "C:\\Windows\\System32"
      : "/usr/bin:/bin:/usr/sbin:/sbin";
    const expected = join(home, ".local", "bin", process.platform === "win32" ? `${bin}.exe` : bin);
    const path = buildLocalExecutablePath({
      basePath: guiPath,
      loginShellPath: "",
      home,
      platform: process.platform,
      env: {},
    });

    expect(findExecutableOnPath(bin, path, {
      platform: process.platform,
      exists: (candidate) => candidate === expected,
    })).toBe(expected);
  });

  it("prefers the login-shell PATH and de-duplicates known install directories", () => {
    const path = buildLocalExecutablePath({
      basePath: "/usr/bin:/bin",
      loginShellPath: "/custom/node/bin:/usr/bin",
      home: "/Users/dev",
      platform: "darwin",
      env: {},
    });
    const entries = path.split(delimiter);

    expect(entries[0]).toBe("/custom/node/bin");
    expect(entries.filter((entry) => entry === "/usr/bin")).toHaveLength(1);
    expect(entries).toContain("/opt/homebrew/bin");
    expect(entries).toContain("/Users/dev/.claude/local");
    expect(entries).toContain("/Users/dev/.local/share/mise/shims");
  });

  it("covers common Windows npm, package-manager, and native installer locations", () => {
    const path = buildLocalExecutablePath({
      basePath: "C:\\Windows\\System32",
      loginShellPath: "",
      home: "C:\\Users\\dev",
      platform: "win32",
      env: {
        APPDATA: "C:\\Users\\dev\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
        ProgramData: "C:\\ProgramData",
      },
    });

    expect(path.split(";")).toEqual(expect.arrayContaining([
      "C:\\Users\\dev\\AppData\\Roaming\\npm",
      "C:\\Users\\dev\\AppData\\Local\\Microsoft\\WinGet\\Links",
      "C:\\Users\\dev\\scoop\\shims",
      "C:\\ProgramData\\chocolatey\\bin",
    ]));
  });
});
