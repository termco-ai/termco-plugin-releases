/**
 * Git-based working-tree checkpoints for a coding-agent run. At run start and
 * each turn-end we snapshot the working tree
 * *without disturbing it* (`git stash create` produces a commit object that
 * captures the current tracked changes but changes nothing on disk); rewinding
 * restores the tree to that snapshot after taking a safety snapshot first, so
 * the rewind itself is undoable.
 *
 * Pure over an injected `git` exec seam (unit-tested with a fake git); index.ts
 * wires an async `execFile` — snapshots run at turn boundaries on the main
 * process, and a synchronous git fork there stalls the UI per agent turn.
 *
 * Honest limitations (surfaced in the UI): needs a git repo; snapshots capture
 * TRACKED changes (a brand-new untracked file the agent creates isn't rewound);
 * restoring discards later tracked edits (guarded by the safety snapshot).
 */

/** Result of one git invocation. `code !== 0` → the command failed. */
export type GitResult = { stdout: string; stderr: string; code: number };

/** Runs `git <args>` in `cwd`. Injected so the module is testable. */
export type GitExec = (args: string[], cwd: string) => GitResult | Promise<GitResult>;

/** A captured point-in-time: the stash-create commit (working tree) + HEAD. */
export type Checkpoint = {
  /** Commit sha capturing the working tree, or null when the tree was clean
   * (nothing to restore beyond HEAD). */
  wip: string | null;
  /** HEAD commit at snapshot time. */
  head: string;
};

export function createCheckpoints(git: GitExec) {
  async function isGitRepo(cwd: string): Promise<boolean> {
    const r = await git(["rev-parse", "--is-inside-work-tree"], cwd);
    return r.code === 0 && r.stdout.trim() === "true";
  }

  /** Capture the current working tree without touching disk/index/stash list.
   * Returns null when `cwd` isn't a git repo. */
  async function snapshot(cwd: string): Promise<Checkpoint | null> {
    if (!(await isGitRepo(cwd))) return null;
    const head = await git(["rev-parse", "HEAD"], cwd);
    // `stash create` returns a commit sha for the WIP, or empty if clean.
    const wip = await git(["stash", "create", "termco-checkpoint"], cwd);
    return {
      wip: wip.code === 0 && wip.stdout.trim() ? wip.stdout.trim() : null,
      head: head.code === 0 ? head.stdout.trim() : "",
    };
  }

  /** Restore the working tree to a checkpoint. Takes a safety snapshot first
   * (returned so the caller can offer an undo). Returns { ok, safety }. */
  async function restore(
    cwd: string,
    cp: Checkpoint,
  ): Promise<{ ok: boolean; safety: Checkpoint | null; error?: string }> {
    if (!(await isGitRepo(cwd))) {
      return { ok: false, safety: null, error: "not a git repository" };
    }
    const safety = await snapshot(cwd);
    // Restore tracked paths to the checkpoint's tree. Prefer the WIP commit;
    // fall back to HEAD when the checkpoint was clean.
    const source = cp.wip ?? cp.head;
    if (!source) return { ok: false, safety, error: "empty checkpoint" };
    const r = await git(["restore", "--source", source, "--worktree", "--", "."], cwd);
    if (r.code !== 0) {
      return { ok: false, safety, error: r.stderr.trim() || "git restore failed" };
    }
    return { ok: true, safety };
  }

  return { isGitRepo, snapshot, restore };
}

export type Checkpoints = ReturnType<typeof createCheckpoints>;
// Owned by the coding-agent-native provider plugin.
