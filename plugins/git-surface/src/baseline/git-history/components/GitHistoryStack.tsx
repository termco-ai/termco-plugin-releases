/**
 * Resolves the active git-history tab and renders its {@link GitHistoryPane}.
 * A thin selector between the tab model and the pane; keyed on the tab id so
 * switching history tabs remounts the pane with fresh state.
 */
import type { GitHistoryTab, Tab } from "../../../tabTypes";
import { GitHistoryPane, type GitHistorySearchHandle } from "../GitHistoryPane";

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

type Props = {
  tabs: Tab[];
  activeId: number;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

export function GitHistoryStack({
  tabs,
  activeId,
  onOpenCommitFile,
  onSearchHandle,
}: Props) {
  const active = tabs.find(
    (t): t is GitHistoryTab => t.kind === "git-history" && t.id === activeId,
  );
  if (!active) return null;
  return (
    <GitHistoryPane
      key={active.id}
      repoRoot={active.repoRoot}
      workspace={active.workspace}
      onOpenCommitFile={onOpenCommitFile}
      onSearchHandle={onSearchHandle}
    />
  );
}
