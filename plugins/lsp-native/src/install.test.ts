import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configureLspInstallRoot,
  detectServer,
  installDirFor,
  resolveInstalledBinJs,
  resolveLocalLaunch,
} from "./install";
import type { LspServerConfig } from "./types";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "termco-lsp-install-"));
  configureLspInstallRoot(join(tmp, "installs"));
});

afterAll(() => {
  configureLspInstallRoot(null);
  rmSync(tmp, { recursive: true, force: true });
});

function seedInstalledPackage(
  dir: string,
  pkgName: string,
  bin: string | Record<string, string>,
): void {
  const pkgDir = join(dir, "node_modules", pkgName);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: pkgName, bin }),
  );
  const rels = typeof bin === "string" ? [bin] : Object.values(bin);
  for (const rel of rels) {
    mkdirSync(join(pkgDir, rel, ".."), { recursive: true });
    writeFileSync(join(pkgDir, rel), "// bin");
  }
}

const BASE: LspServerConfig = {
  id: "srv",
  name: "Srv",
  languages: ["xx"],
  command: "srv-langserver",
  args: ["--stdio"],
  rootMarkers: [".git"],
  enabled: true,
};

describe("resolveInstalledBinJs", () => {
  it("resolves from a bin map", () => {
    const dir = join(tmp, "a");
    seedInstalledPackage(dir, "some-ls", {
      "some-ls": "lib/cli.js",
      "some-ls-helper": "lib/helper.js",
    });
    expect(resolveInstalledBinJs(dir, "some-ls", "some-ls")).toBe(
      join(dir, "node_modules", "some-ls", "lib/cli.js"),
    );
    expect(resolveInstalledBinJs(dir, "some-ls", "some-ls-helper")).toContain(
      "helper.js",
    );
    expect(resolveInstalledBinJs(dir, "some-ls", "nope")).toBeNull();
  });

  it("resolves a string bin only for the package's own name", () => {
    const dir = join(tmp, "b");
    seedInstalledPackage(dir, "solo-ls", "lib/main.js");
    expect(resolveInstalledBinJs(dir, "solo-ls")).toBe(
      join(dir, "node_modules", "solo-ls", "lib/main.js"),
    );
    expect(resolveInstalledBinJs(dir, "solo-ls", "other")).toBeNull();
  });

  it("returns null for missing installs", () => {
    expect(resolveInstalledBinJs(join(tmp, "nope"), "ghost")).toBeNull();
  });
});

describe("resolveLocalLaunch", () => {
  it("prefers the managed install and runs it via Electron-as-Node", async () => {
    const config: LspServerConfig = {
      ...BASE,
      autoInstall: { npmPackage: "srv-ls", version: "1.0.0", bin: "srv-langserver" },
    };
    const dir = installDirFor(config);
    expect(dir).toContain("srv-ls@1.0.0");
    if (!dir) throw new Error("no dir");
    seedInstalledPackage(dir, "srv-ls", { "srv-langserver": "out/server.js" });
    const launch = await resolveLocalLaunch(config);
    expect(launch?.source).toBe("installed");
    expect(launch?.command).toBe(process.execPath);
    expect(launch?.args[0]).toContain("out/server.js");
    expect(launch?.args).toContain("--stdio");
    expect(launch?.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    expect(await detectServer(config)).toBe("installed");
  });

  it("custom servers with paths pass through verbatim", async () => {
    const config: LspServerConfig = {
      ...BASE,
      id: "custom",
      command: "/opt/weird/bin/weird-ls",
      custom: true,
    };
    const launch = await resolveLocalLaunch(config);
    expect(launch).toEqual({
      command: "/opt/weird/bin/weird-ls",
      args: ["--stdio"],
      source: "config",
    });
  });

  it("reports missing when neither installed nor on PATH", async () => {
    const config: LspServerConfig = {
      ...BASE,
      id: "gone",
      command: "definitely-not-a-real-binary-xyz",
    };
    expect(await resolveLocalLaunch(config)).toBeNull();
    expect(await detectServer(config)).toBe("missing");
  });
});
