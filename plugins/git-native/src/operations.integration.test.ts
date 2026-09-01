/**
 * Integration test — status/stage/commit/log/diff/branch against a real temp
 * repo.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import "./testRuntime";
import { gitStatus } from "./status";
import * as ops from "./operations";

const LOCAL = { kind: "local" as const };

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "termco-gitint-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  git("init", "-b", "main");
  git("config", "user.email", "t@t.dev");
  git("config", "user.name", "T");
  return dir;
}

describe("git operations (integration)", () => {
  let dir: string;
  beforeEach(() => {
    dir = repo();
  });

  it("status shows untracked, stage moves it to staged, commit + log record it", async () => {
    writeFileSync(join(dir, "a.txt"), "hello\n");
    let st = await gitStatus(dir, LOCAL);
    expect(st.changedFiles.some((f) => f.path === "a.txt" && f.untracked)).toBe(true);

    await ops.stage(dir, ["a.txt"], LOCAL);
    st = await gitStatus(dir, LOCAL);
    const f = st.changedFiles.find((x) => x.path === "a.txt");
    expect(f?.staged).toBe(true);

    const commit = await ops.commit(dir, "add a", LOCAL);
    expect(commit.commitSha.length).toBeGreaterThan(6);
    expect(commit.summary).toBe("add a");

    const entries = await ops.log(dir, 10, undefined, LOCAL);
    expect(entries.length).toBe(1);
    expect(entries[0].subject).toBe("add a");
    expect(entries[0].filesChanged).toBe(1);
    expect(entries[0].insertions).toBe(1);
  });

  it("diff reports worktree changes; unstage returns a staged file to unstaged", async () => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    await ops.stage(dir, ["a.txt"], LOCAL);
    await ops.commit(dir, "init", LOCAL);
    writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
    const d = await ops.diff(dir, undefined, false, LOCAL);
    expect(d.diffText).toMatch(/\+two/);

    await ops.stage(dir, ["a.txt"], LOCAL);
    let st = await gitStatus(dir, LOCAL);
    expect(st.changedFiles.find((x) => x.path === "a.txt")?.staged).toBe(true);
    await ops.unstage(dir, ["a.txt"], LOCAL);
    st = await gitStatus(dir, LOCAL);
    expect(st.changedFiles.find((x) => x.path === "a.txt")?.unstaged).toBe(true);
  });

  it("list_branches includes the current branch", async () => {
    writeFileSync(join(dir, "a.txt"), "x");
    await ops.stage(dir, ["a.txt"], LOCAL);
    await ops.commit(dir, "init", LOCAL);
    const res = await ops.listBranches(dir, LOCAL);
    const main = res.branches.find((b) => b.name === "main");
    expect(main).toBeDefined();
    expect(main?.isHead).toBe(true);
  });

  describe("remote branches", () => {
    /** Clone `dir` so the clone has a real `origin` with branches on it. */
    async function withRemote(): Promise<string> {
      writeFileSync(join(dir, "a.txt"), "x");
      await ops.stage(dir, ["a.txt"], LOCAL);
      await ops.commit(dir, "init", LOCAL);
      const git = (cwd: string, ...a: string[]) =>
        execFileSync("git", a, {
          cwd,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
      // A branch that will exist ONLY on the remote after cloning.
      git(dir, "branch", "feature-x");
      const clone = mkdtempSync(join(tmpdir(), "termco-gitint-clone-"));
      git(clone, "clone", dir, ".");
      git(clone, "config", "user.email", "t@t.dev");
      git(clone, "config", "user.name", "T");
      return clone;
    }

    it("lists a remote-only branch and hides ones that exist locally", async () => {
      const clone = await withRemote();
      const res = await ops.listBranches(clone, LOCAL);
      const names = res.branches.map((b) => b.name);

      // Only on the remote → listed, fully qualified.
      expect(names).toContain("origin/feature-x");
      const remote = res.branches.find((b) => b.name === "origin/feature-x");
      expect(remote?.kind).toBe("remote");

      // `main` is checked out locally → the remote twin is noise, not listed.
      expect(names).toContain("main");
      expect(names).not.toContain("origin/main");
      // The symbolic default-branch pointer is not a branch.
      expect(names).not.toContain("origin/HEAD");
    });

    it("checking out a remote branch creates a local tracking branch", async () => {
      const clone = await withRemote();
      await ops.checkoutBranch(clone, "origin/feature-x", LOCAL);

      const res = await ops.listBranches(clone, LOCAL);
      const local = res.branches.find((b) => b.name === "feature-x");
      expect(local?.kind).toBe("local");
      expect(local?.isHead).toBe(true);
      // The whole point: tracking, not detached HEAD.
      expect(local?.isDetached).toBe(false);
      expect(local?.upstream).toBe("origin/feature-x");
      // …and it no longer shows up as a remote-only branch.
      expect(res.branches.map((b) => b.name)).not.toContain("origin/feature-x");
    });

    it("checking out a remote name whose local branch exists just switches", async () => {
      const clone = await withRemote();
      await ops.checkoutBranch(clone, "origin/feature-x", LOCAL);
      await ops.checkoutBranch(clone, "main", LOCAL);
      // Second time: the local branch is already there — must not fail with
      // "branch already exists".
      await ops.checkoutBranch(clone, "origin/feature-x", LOCAL);
      const res = await ops.listBranches(clone, LOCAL);
      expect(res.branches.find((b) => b.name === "feature-x")?.isHead).toBe(
        true,
      );
    });

    it("still checks out a plain local branch", async () => {
      const clone = await withRemote();
      await ops.checkoutBranch(clone, "main", LOCAL);
      const res = await ops.listBranches(clone, LOCAL);
      expect(res.branches.find((b) => b.name === "main")?.isHead).toBe(true);
    });
  });

  it("commit_files reports the files in a commit with numstat", async () => {
    // Root commit first (diff-tree shows no files vs no parent).
    writeFileSync(join(dir, "seed.txt"), "seed\n");
    await ops.stage(dir, ["seed.txt"], LOCAL);
    await ops.commit(dir, "seed", LOCAL);
    // Second commit is what we inspect.
    writeFileSync(join(dir, "a.txt"), "x\ny\n");
    await ops.stage(dir, ["a.txt"], LOCAL);
    const commit = await ops.commit(dir, "add a", LOCAL);
    const files = await ops.commitFiles(dir, commit.commitSha, LOCAL);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("a.txt");
    expect(files[0].status).toBe("A");
    expect(files[0].added).toBe(2);
  });
});

/**
 * `diffContent` against a real repo — the sides, and the reason behind each.
 *
 * These exist because the screenshot bug (an SSH rig reading its working copy
 * from the wrong machine) was invisible: a failed read and an empty file were
 * the same empty string, so a broken diff looked like a plausible one.
 */
describe("diffContent (integration)", () => {
  let dir: string;
  beforeEach(() => {
    dir = repo();
  });

  const git = (d: string, ...a: string[]) =>
    execFileSync("git", a, { cwd: d, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });

  it("reports both sides as ok for an ordinary edit", async () => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-m", "add");
    writeFileSync(join(dir, "a.txt"), "two\n");

    const res = await ops.diffContent(dir, "a.txt", false, undefined, LOCAL);
    expect(res.originalContent).toBe("one\n");
    expect(res.modifiedContent).toBe("two\n");
    expect(res.originalState).toBe("ok");
    expect(res.modifiedState).toBe("ok");
  });

  // The shape the bug produced. It is a legitimate state — the file really was
  // deleted — and the caller must be able to tell it apart from an empty file.
  it("marks a deleted working copy as missing, not as empty", async () => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-m", "add");
    rmSync(join(dir, "a.txt"));

    const res = await ops.diffContent(dir, "a.txt", false, undefined, LOCAL);
    expect(res.originalContent).toBe("one\n");
    expect(res.modifiedContent).toBe("");
    expect(res.modifiedState).toBe("missing");
  });

  it("marks a genuinely empty file as ok", async () => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-m", "add");
    writeFileSync(join(dir, "a.txt"), "");

    const res = await ops.diffContent(dir, "a.txt", false, undefined, LOCAL);
    expect(res.modifiedContent).toBe("");
    // The distinction the viewer needs: empty is not the same as unreadable.
    expect(res.modifiedState).toBe("ok");
  });

  it("marks a new file's original side as missing", async () => {
    writeFileSync(join(dir, "new.txt"), "fresh\n");
    git(dir, "add", "new.txt");

    const res = await ops.diffContent(dir, "new.txt", true, undefined, LOCAL);
    expect(res.originalState).toBe("missing");
    expect(res.modifiedState).toBe("ok");
  });

  /**
   * Pins down the rename case rather than guessing at it. With the rename
   * staged, the index entry lives under the NEW path, so the unstaged diff
   * comparing index-to-worktree is right to ignore `originalPath`.
   */
  it("diffs a staged rename with further unstaged edits", async () => {
    writeFileSync(join(dir, "old.txt"), "one\n");
    git(dir, "add", "old.txt");
    git(dir, "commit", "-m", "add");
    git(dir, "mv", "old.txt", "new.txt");
    writeFileSync(join(dir, "new.txt"), "two\n");

    const res = await ops.diffContent(dir, "new.txt", false, "old.txt", LOCAL);
    expect(res.originalContent).toBe("one\n");
    expect(res.modifiedContent).toBe("two\n");
    expect(res.originalState).toBe("ok");
    expect(res.modifiedState).toBe("ok");
  });
});
