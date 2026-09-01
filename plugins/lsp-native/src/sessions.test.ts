import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configureLspConfigPath,
  effectiveServers,
  serversForLanguage,
  setServerEnabled,
  upsertCustomServer,
} from "./config";
import { configureLspInstallRoot } from "./install";
import { findProjectRootLocal, SessionManager, walkRootLocal } from "./sessions";
import { substituteLaunchArgs, type SessionStatus } from "./types";

const FIXTURE = join(__dirname, "__fixtures__", "fake-lsp.mjs");

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "termco-lsp-test-"));
  configureLspConfigPath(join(tmp, "termco-lsp.json"));
  configureLspInstallRoot(join(tmp, "installs"));
});

afterAll(() => {
  configureLspConfigPath(null);
  configureLspInstallRoot(null);
  rmSync(tmp, { recursive: true, force: true });
});

async function poll(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("poll timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("findProjectRootLocal", () => {
  it("finds the nearest marker dir and prefers outermost equal-priority", () => {
    const root = join(tmp, "proj");
    const pkg = join(root, "packages", "app");
    mkdirSync(join(pkg, "src"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), "{}");
    writeFileSync(join(pkg, "tsconfig.json"), "{}");
    const file = join(pkg, "src", "a.ts");
    writeFileSync(file, "");
    // Both root and package have tsconfig — the outermost (repo root) wins.
    expect(
      findProjectRootLocal(file, ["tsconfig.json", "package.json"], root),
    ).toBe(root);
  });

  it("higher-priority marker beats closer lower-priority marker", () => {
    const root = join(tmp, "proj2");
    const nested = join(root, "svc");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "Cargo.toml"), "");
    writeFileSync(join(nested, ".git"), "");
    const file = join(nested, "main.rs");
    writeFileSync(file, "");
    expect(findProjectRootLocal(file, ["Cargo.toml", ".git"], root)).toBe(root);
  });

  it("falls back to the rig root without any marker", () => {
    const root = join(tmp, "bare");
    mkdirSync(join(root, "deep"), { recursive: true });
    const file = join(root, "deep", "x.py");
    writeFileSync(file, "");
    expect(findProjectRootLocal(file, ["pyproject.toml"], root)).toBe(root);
  });
});

describe("config merge", () => {
  it("curated servers are present and overridable", () => {
    expect(serversForLanguage("ts")[0]?.id).toBe("typescript");
    setServerEnabled("typescript", false);
    expect(serversForLanguage("ts").find((s) => s.id === "typescript")).toBeUndefined();
    setServerEnabled("typescript", true);
    expect(serversForLanguage("ts")[0]?.id).toBe("typescript");
  });

  it("custom servers merge in and reserved ids are rejected", () => {
    upsertCustomServer({
      id: "elixir",
      name: "Elixir LS",
      languages: ["ex"],
      command: "elixir-ls",
      args: [],
      rootMarkers: ["mix.exs"],
      enabled: true,
    });
    expect(serversForLanguage("ex")[0]?.custom).toBe(true);
    expect(effectiveServers().some((s) => s.id === "elixir")).toBe(true);
    expect(() =>
      upsertCustomServer({
        id: "typescript",
        name: "x",
        languages: [],
        command: "x",
        args: [],
        rootMarkers: [],
        enabled: true,
      }),
    ).toThrow(/reserved/);
  });
});

describe("SessionManager against a real fake server", () => {
  it("spawns, syncs, publishes diagnostics, serves hover, shuts down", async () => {
    const proj = join(tmp, "fakeproj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, ".fakeproj"), "");
    const file = join(proj, "main.fk");
    const text = "hello\nTODO fix this\n";
    writeFileSync(file, text);

    upsertCustomServer({
      id: "fake",
      name: "Fake LSP",
      languages: ["fk"],
      command: process.execPath,
      args: [FIXTURE],
      rootMarkers: [".fakeproj"],
      enabled: true,
    });

    const diags: Array<{ path: string; version?: number; count: number }> = [];
    let statuses: SessionStatus[] = [];
    const mgr = new SessionManager(
      (p) => diags.push({ path: p.path, version: p.version, count: p.diagnostics.length }),
      (s) => {
        statuses = s;
      },
    );

    const result = await mgr.docOpen(
      { kind: "local" },
      proj,
      file,
      "fk",
      "fake",
      text,
      1,
    );
    expect(result.active).toBe(true);
    expect(result.serverId).toBe("fake");
    expect(statuses.some((s) => s.state === "running")).toBe(true);

    // didOpen triggers the TODO diagnostic on line 1
    await poll(() => diags.some((d) => d.path === file && d.count === 1));

    // edit away the TODO → diagnostics go empty
    const edited = "hello\nDONE fix this\n";
    mgr.docChange({ kind: "local" }, file, 2, [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 4 },
        },
        text: "DONE",
      },
    ]);
    await poll(() => diags.some((d) => d.count === 0));
    expect(mgr.sessionForDoc({ kind: "local" }, file)?.docText(file)).toBe(
      edited,
    );

    const hover = (await mgr.hover({ kind: "local" }, file, {
      line: 0,
      character: 0,
    })) as { contents: { value: string } };
    expect(hover.contents.value).toContain("docs for");

    // closing the last doc clears diagnostics deterministically
    mgr.docClose({ kind: "local" }, file, 1);
    expect(diags.at(-1)).toEqual({ path: file, version: undefined, count: 0 });

    await mgr.shutdownAll();
  }, 20_000);

  it("reports missing for a nonexistent server binary", async () => {
    upsertCustomServer({
      id: "ghost",
      name: "Ghost",
      languages: ["gh"],
      command: "/definitely/not/here/ghost-lsp",
      args: [],
      rootMarkers: [".git"],
      enabled: true,
    });
    const mgr = new SessionManager(
      () => {},
      () => {},
    );
    const proj = join(tmp, "ghostproj");
    mkdirSync(proj, { recursive: true });
    const file = join(proj, "x.gh");
    writeFileSync(file, "");
    const result = await mgr.docOpen(
      { kind: "local" },
      proj,
      file,
      "gh",
      "ghost",
      "",
      1,
    );
    expect(result.active).toBe(false);
    // Spawn of a nonexistent absolute path fails at init → error/missing
    expect(["missing", "error"]).toContain(result.reason);
    expect(result.detail).toMatch(/ghost-lsp|ENOENT|spawn/i);
    expect(mgr.statusList()[0]?.lastError).toMatch(/ghost-lsp|ENOENT|spawn/i);
    await mgr.shutdownAll();
  }, 20_000);
});

describe("substituteLaunchArgs", () => {
  it("replaces ${root} everywhere and leaves other args alone", () => {
    expect(
      substituteLaunchArgs(
        ["--stdio", "--tsProbeLocations", "${root}/node_modules", "--x=${root}"],
        { root: "/proj" },
      ),
    ).toEqual(["--stdio", "--tsProbeLocations", "/proj/node_modules", "--x=/proj"]);
  });

  it("${serverModules} uses the managed install, falling back to the root", () => {
    expect(
      substituteLaunchArgs(["${root}/node_modules,${serverModules}"], {
        root: "/proj",
        serverModules: "/data/lsp/pkg@1/node_modules",
      }),
    ).toEqual(["/proj/node_modules,/data/lsp/pkg@1/node_modules"]);
    expect(
      substituteLaunchArgs(["${serverModules}"], { root: "/proj" }),
    ).toEqual(["/proj/node_modules"]);
  });
});

describe("walkRootLocal (projectMarkers probe)", () => {
  it("returns null when no marker exists, the dir otherwise", () => {
    const root = join(tmp, "ngproj");
    mkdirSync(join(root, "src"), { recursive: true });
    const file = join(root, "src", "a.html");
    writeFileSync(file, "");
    expect(walkRootLocal(file, ["angular.json"], root)).toBeNull();
    writeFileSync(join(root, "angular.json"), "{}");
    expect(walkRootLocal(file, ["angular.json"], root)).toBe(root);
  });
});

describe("specificity routing + secondary fan-out", () => {
  it("marker-matched server beats the generic; generic wins elsewhere", async () => {
    upsertCustomServer({
      id: "fake-generic",
      name: "Fake generic",
      languages: ["fkx"],
      command: process.execPath,
      args: [FIXTURE],
      rootMarkers: [".git"],
      enabled: true,
    });
    upsertCustomServer({
      id: "fake-ng",
      name: "Fake ng",
      languages: ["fkx"],
      projectMarkers: ["angular.json"],
      command: process.execPath,
      args: [FIXTURE],
      rootMarkers: ["angular.json"],
      enabled: true,
    });
    const mgr = new SessionManager(
      () => {},
      () => {},
    );

    const ngProj = join(tmp, "route-ng");
    mkdirSync(ngProj, { recursive: true });
    writeFileSync(join(ngProj, "angular.json"), "{}");
    const ngFile = join(ngProj, "t.fkx");
    writeFileSync(ngFile, "x");
    const ngResult = await mgr.docOpen(
      { kind: "local" },
      ngProj,
      ngFile,
      "fkx",
      "fkx",
      "x",
      1,
    );
    expect(ngResult.serverId).toBe("fake-ng");

    const plainProj = join(tmp, "route-plain");
    mkdirSync(plainProj, { recursive: true });
    const plainFile = join(plainProj, "t.fkx");
    writeFileSync(plainFile, "x");
    const plainResult = await mgr.docOpen(
      { kind: "local" },
      plainProj,
      plainFile,
      "fkx",
      "fkx",
      "x",
      1,
    );
    expect(plainResult.serverId).toBe("fake-generic");

    await mgr.shutdownAll();
  }, 20_000);

  it("secondaries attach, receive changes, and merge diagnostics", async () => {
    upsertCustomServer({
      id: "fake-primary",
      name: "Fake primary",
      languages: ["fks"],
      command: process.execPath,
      args: [FIXTURE],
      rootMarkers: [".fakeproj"],
      enabled: true,
    });
    upsertCustomServer({
      id: "fake-linter",
      name: "Fake linter",
      role: "secondary",
      languages: ["fks"],
      command: process.execPath,
      args: [FIXTURE],
      rootMarkers: [".fakeproj"],
      enabled: true,
    });
    const proj = join(tmp, "secproj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, ".fakeproj"), "");
    const file = join(proj, "main.fks");
    const text = "TODO one\n";
    writeFileSync(file, text);

    const pushes: Array<{ serverId: string; count: number }> = [];
    const mgr = new SessionManager(
      (p) => pushes.push({ serverId: p.serverId, count: p.diagnostics.length }),
      () => {},
    );
    const result = await mgr.docOpen(
      { kind: "local" },
      proj,
      file,
      "fks",
      "fks",
      text,
      1,
    );
    expect(result.active).toBe(true);
    expect(result.serverId).toBe("fake-primary");
    expect(result.secondaries).toEqual([
      { sessionKey: expect.stringContaining("fake-linter"), serverId: "fake-linter" },
    ]);

    // Both sessions publish the TODO diagnostic under their own serverId.
    await poll(() =>
      ["fake-primary", "fake-linter"].every((id) =>
        pushes.some((p) => p.serverId === id && p.count === 1),
      ),
    );
    // The AI-facing merged cache sees both slices.
    const cached = mgr.cachedDiagnostics({ kind: "local" });
    expect(cached.find((c) => c.path === file)?.diagnostics).toHaveLength(2);
    expect(mgr.diagnosticSlices({ kind: "local" }, file)).toEqual([
      expect.objectContaining({ serverId: "fake-primary", diagnostics: [expect.anything()] }),
      expect.objectContaining({ serverId: "fake-linter", diagnostics: [expect.anything()] }),
    ]);

    // A change fans out to BOTH sessions (each re-publishes empty).
    mgr.docChange({ kind: "local" }, file, 2, [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
        text: "DONE",
      },
    ]);
    await poll(() =>
      ["fake-primary", "fake-linter"].every((id) =>
        pushes.some((p) => p.serverId === id && p.count === 0),
      ),
    );

    // Close clears everything with the "*" wildcard.
    mgr.docClose({ kind: "local" }, file, 1);
    expect(mgr.cachedDiagnostics({ kind: "local" })).toHaveLength(0);
    await mgr.shutdownAll();
  }, 20_000);
});
