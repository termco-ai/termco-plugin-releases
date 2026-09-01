import { describe, expect, it, vi } from "vitest";
import { createCheckpoints, type GitResult } from "./checkpoints";

/** A scripted git: maps a joined-args prefix to a result. */
function fakeGit(script: Record<string, GitResult>) {
  const calls: string[][] = [];
  const git = vi.fn((args: string[]): GitResult => {
    calls.push(args);
    const key = args.join(" ");
    for (const prefix of Object.keys(script)) {
      if (key.startsWith(prefix)) return script[prefix];
    }
    return { stdout: "", stderr: "", code: 0 };
  });
  return { git, calls };
}

const OK = (stdout = ""): GitResult => ({ stdout, stderr: "", code: 0 });
const FAIL = (stderr = "err"): GitResult => ({ stdout: "", stderr, code: 1 });

describe("checkpoints", () => {
  it("reports non-git dirs and returns null snapshot", async () => {
    const { git } = fakeGit({ "rev-parse --is-inside-work-tree": FAIL() });
    const cp = createCheckpoints(git);
    expect(await cp.isGitRepo("/x")).toBe(false);
    expect(await cp.snapshot("/x")).toBeNull();
  });

  it("captures HEAD + a WIP stash-create commit", async () => {
    const { git } = fakeGit({
      "rev-parse --is-inside-work-tree": OK("true"),
      "rev-parse HEAD": OK("headsha"),
      "stash create": OK("wipsha"),
    });
    const cp = await createCheckpoints(git).snapshot("/repo");
    expect(cp).toEqual({ wip: "wipsha", head: "headsha" });
  });

  it("treats an empty stash-create (clean tree) as wip=null", async () => {
    const { git } = fakeGit({
      "rev-parse --is-inside-work-tree": OK("true"),
      "rev-parse HEAD": OK("headsha"),
      "stash create": OK(""),
    });
    expect(await createCheckpoints(git).snapshot("/repo")).toEqual({
      wip: null,
      head: "headsha",
    });
  });

  it("restores to the WIP commit and takes a safety snapshot first", async () => {
    const { git, calls } = fakeGit({
      "rev-parse --is-inside-work-tree": OK("true"),
      "rev-parse HEAD": OK("headsha"),
      "stash create": OK("safetysha"),
      "restore --source wipsha": OK(),
    });
    const r = await createCheckpoints(git).restore("/repo", {
      wip: "wipsha",
      head: "headsha",
    });
    expect(r.ok).toBe(true);
    expect(r.safety).toEqual({ wip: "safetysha", head: "headsha" });
    // The restore targeted the WIP commit against the worktree.
    expect(
      calls.some(
        (c) =>
          c[0] === "restore" && c.includes("--source") && c.includes("wipsha"),
      ),
    ).toBe(true);
  });

  it("falls back to HEAD when the checkpoint had no WIP", async () => {
    const { git, calls } = fakeGit({
      "rev-parse --is-inside-work-tree": OK("true"),
      "rev-parse HEAD": OK("h"),
      "stash create": OK(""),
      "restore --source headsha": OK(),
    });
    const r = await createCheckpoints(git).restore("/repo", {
      wip: null,
      head: "headsha",
    });
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.includes("headsha"))).toBe(true);
  });

  it("surfaces a restore failure with its stderr", async () => {
    const { git } = fakeGit({
      "rev-parse --is-inside-work-tree": OK("true"),
      "rev-parse HEAD": OK("h"),
      "stash create": OK("s"),
      "restore --source wipsha": FAIL("conflict"),
    });
    const r = await createCheckpoints(git).restore("/repo", {
      wip: "wipsha",
      head: "h",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("conflict");
  });
});
// Owned by the coding-agent-native provider plugin.
