/**
 * Rich body for `git status`: one clickable row per changed file (live
 * from the repo, not parsed from the text output). Clicking opens the
 * worktree diff for that file.
 */
import type {
  GitChangedFile,
} from "../../../../nativeTypes";
import type { WorkspaceEnv } from "../../../../runtime";
import { terminalRuntime } from "../../../../runtime";
import { useEffect, useState } from "react";
import { openDiffFromBlock } from "../../lib/blockEvents";

type Row = { file: GitChangedFile; badge: string; cls: string };

function badgeFor(f: GitChangedFile): { badge: string; cls: string } {
  if (f.untracked) return { badge: "U", cls: "tb-git-badge-u" };
  const s = f.worktreeStatus !== " " ? f.worktreeStatus : f.indexStatus;
  if (s === "D") return { badge: "D", cls: "tb-git-badge-d" };
  if (s === "A") return { badge: "A", cls: "tb-git-badge-u" };
  return { badge: s || "M", cls: "tb-git-badge-m" };
}

export function GitStatusWidget({
  cwd,
  env,
  onEmpty,
}: {
  cwd: string;
  env: WorkspaceEnv;
  onEmpty: () => void;
}) {
  const [state, setState] = useState<{ repoRoot: string; rows: Row[] } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    const git = terminalRuntime().git;
    if (!git) {
      onEmpty();
      return;
    }
    (async () => {
      // The env of the terminal this block ran in — NOT the global active env,
      // so a block belonging to a non-active rig reads the right backend.
      const repo = await git.resolveRepo(cwd, env);
      if (!repo) throw new Error("not a repo");
      const status = await git.status(repo.repoRoot, env);
      if (!alive) return;
      if (status.changedFiles.length === 0) {
        onEmpty();
        return;
      }
      setState({
        repoRoot: status.repoRoot,
        rows: status.changedFiles.map((file) => ({
          file,
          ...badgeFor(file),
        })),
      });
    })().catch(() => {
      if (alive) onEmpty();
    });
    return () => {
      alive = false;
    };
  }, [cwd, env, onEmpty]);

  if (!state) return null;

  return (
    <div className="tb-git">
      {state.rows.map(({ file, badge, cls }) => (
        <button
          type="button"
          key={file.path}
          className="tb-git-row"
          onClick={() => openDiffFromBlock(file.path, state.repoRoot)}
        >
          <span className={`tb-git-badge ${cls}`}>{badge}</span>
          <span className="tb-git-path">{file.path}</span>
          <span className="tb-git-hint">view diff →</span>
        </button>
      ))}
    </div>
  );
}
