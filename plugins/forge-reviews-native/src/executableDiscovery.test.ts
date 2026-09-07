import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildForgeExecutablePath, findForgeExecutableOnPath } from "./executableDiscovery";

describe("forge CLI executable discovery", () => {
  it("finds a system installation even when both inherited PATHs are empty", () => {
    const path = buildForgeExecutablePath({ basePath: "", loginShellPath: "", home: "/home/dev", platform: "linux", env: {} });
    expect(findForgeExecutableOnPath("glab", path, {
      platform: "linux", exists: (candidate) => candidate === "/usr/bin/glab",
    })).toBe("/usr/bin/glab");
  });
  it.each([
    "gh",
    "glab",
    "tea",
  ])("finds %s in ~/.local/bin when Electron has a restricted GUI PATH", (bin) => {
    const home = process.platform === "win32" ? "C:\\Users\\dev" : "/Users/dev";
    const guiPath =
      process.platform === "win32" ? "C:\\Windows\\System32" : "/usr/bin:/bin:/usr/sbin:/sbin";
    const expected = join(home, ".local", "bin", process.platform === "win32" ? `${bin}.exe` : bin);
    const path = buildForgeExecutablePath({
      basePath: guiPath,
      loginShellPath: "",
      home,
      platform: process.platform,
      env: {},
    });

    expect(
      findForgeExecutableOnPath(bin, path, {
        platform: process.platform,
        exists: (candidate) => candidate === expected,
      }),
    ).toBe(expected);
  });

  it("prefers login-shell PATH and searches Homebrew, MacPorts, Linuxbrew, and Snap", () => {
    const path = buildForgeExecutablePath({
      basePath: "/usr/bin:/bin",
      loginShellPath: "/custom/forge/bin:/usr/bin",
      home: "/Users/dev",
      platform: "darwin",
      env: {},
    });
    const entries = path.split(delimiter);

    expect(entries[0]).toBe("/custom/forge/bin");
    expect(entries.filter((entry) => entry === "/usr/bin")).toHaveLength(1);
    expect(entries).toEqual(
      expect.arrayContaining([
        "/Users/dev/.local/bin",
        "/Users/dev/.asdf/shims",
        "/Users/dev/.local/share/mise/shims",
        "/Users/dev/.nix-profile/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
        "/home/linuxbrew/.linuxbrew/bin",
        "/snap/bin",
        "/nix/var/nix/profiles/default/bin",
      ]),
    );
  });

  it("covers common Windows native installer and package-manager locations", () => {
    const path = buildForgeExecutablePath({
      basePath: "C:\\Windows\\System32",
      loginShellPath: "",
      home: "C:\\Users\\dev",
      platform: "win32",
      env: {
        LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
        ProgramData: "C:\\ProgramData",
        ProgramFiles: "C:\\Program Files",
      },
    });

    expect(path.split(";")).toEqual(
      expect.arrayContaining([
        "C:\\Users\\dev\\AppData\\Local\\Microsoft\\WinGet\\Links",
        "C:\\Users\\dev\\AppData\\Local\\Programs\\GitHub CLI",
        "C:\\Program Files\\GitHub CLI",
        "C:\\Users\\dev\\scoop\\shims",
        "C:\\ProgramData\\chocolatey\\bin",
      ]),
    );
  });
});
