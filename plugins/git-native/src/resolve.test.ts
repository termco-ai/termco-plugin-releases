/**
 * Integration test — the resolve read-path against a real temp git repo.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "./testRuntime";
import { resolveRepo } from "./resolve";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "termco-git-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  git("init", "-b", "main");
  git("config", "user.email", "t@t.dev");
  git("config", "user.name", "Termco Test");
  writeFileSync(join(dir, "a.txt"), "hello");
  git("add", "a.txt");
  git("commit", "-m", "init");
  return dir;
}

describe("git/resolve (integration)", () => {
  it("returns null outside a repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-nogit-"));
    expect(await resolveRepo(dir, { kind: "local" })).toBeNull();
  });

  it("resolves repo root and branch inside a repo", async () => {
    const dir = initRepo();
    const info = await resolveRepo(dir, { kind: "local" });
    expect(info).not.toBeNull();
    expect(info?.branch).toBe("main");
    expect(info?.isDetached).toBe(false);
    expect(info?.repoRoot.length).toBeGreaterThan(0);
  });

  it("reports detached HEAD", async () => {
    const dir = initRepo();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir })
      .toString()
      .trim();
    execFileSync("git", ["checkout", sha], { cwd: dir, env: process.env });
    const info = await resolveRepo(dir, { kind: "local" });
    expect(info?.isDetached).toBe(true);
    expect(info?.branch).toBe("HEAD");
  });
});
