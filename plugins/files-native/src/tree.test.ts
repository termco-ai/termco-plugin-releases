/**
 * Integration test for the fs_read_dir gitignore decoration (backed by real
 * git).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fsReadDir, listSubdirs } from "./tree";
import "./testRuntime";

describe("fsReadDir blank-path backstop", () => {
  it("returns [] for an empty/blank path instead of throwing scandir ''", async () => {
    // Regression: a terminal `ls` block whose cwd is "/" (or untracked) used to
    // pass "" here and spew a cryptic ENOENT to the main console.
    expect(await fsReadDir("", false, false, { kind: "local" })).toEqual([]);
    expect(await fsReadDir("   ", true, true, { kind: "local" })).toEqual([]);
    expect(await listSubdirs("", false, { kind: "local" })).toEqual([]);
  });
});

describe("fsReadDir gitignore decoration", () => {
  it("flags gitignored entries only when git_decorations is on", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-tree-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, ".gitignore"), "ignored.log\nbuilddir/\n");
    writeFileSync(join(dir, "kept.txt"), "x");
    writeFileSync(join(dir, "ignored.log"), "x");
    mkdirSync(join(dir, "builddir"));
    writeFileSync(join(dir, "builddir", "out"), "x");

    const withDeco = await fsReadDir(dir, false, true, { kind: "local" });
    const byName = Object.fromEntries(withDeco.map((e) => [e.name, e.gitignored]));
    expect(byName["kept.txt"]).toBe(false);
    expect(byName["ignored.log"]).toBe(true);
    expect(byName["builddir"]).toBe(true);

    // Without decorations, nothing is flagged.
    const noDeco = await fsReadDir(dir, false, false, { kind: "local" });
    expect(noDeco.every((e) => e.gitignored === false)).toBe(true);
  });
});
