/**
 * `GitDiffStack` — renders the {@link GitDiffPane} for the active git-diff tab.
 *
 * Handles both working-tree (`git-diff`) and committed-file (`git-commit-file`)
 * tabs, building the appropriate diff `source` and keying the pane by tab id.
 */
import type { GitCommitFileDiffTab, GitDiffTab, Tab } from "../../../tabTypes";
import { GitDiffPane } from "./GitDiffPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function GitDiffStack({ tabs, activeId }: Props) {
  const active = tabs.find(
    (t): t is GitDiffTab | GitCommitFileDiffTab =>
      (t.kind === "git-diff" || t.kind === "git-commit-file") &&
      t.id === activeId,
  );
  if (!active) return null;
  if (active.kind === "git-diff") {
    return (
      <div className="h-full w-full">
        <GitDiffPane
          key={active.id}
          active
          source={{
            kind: "working",
            repoRoot: active.repoRoot,
            path: active.path,
            mode: active.mode,
            originalPath: active.originalPath,
            workspace: active.workspace,
          }}
        />
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <GitDiffPane
        key={active.id}
        active
        source={{
          kind: "commit",
          repoRoot: active.repoRoot,
          sha: active.sha,
          path: active.path,
          originalPath: active.originalPath,
          workspace: active.workspace,
        }}
        chipLabel={active.shortSha}
      />
    </div>
  );
}
