/**
 * Shared types for the git-history module.
 *
 * These describe the data shapes that cross boundaries between the history
 * pane container, its hooks, and its presentational sub-components. Extracted
 * from the former monolithic `GitHistoryPane.tsx` so each concern imports only
 * the types it needs.
 */
import type { GitCommitFileChange } from "../../runtime";

/**
 * Payload emitted when a user opens a single file's diff from a commit's
 * detail popover. Threaded up to the workspace so it can spawn a diff tab.
 */
export type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

/**
 * Imperative handle exposed to the header search bar so it can drive commit
 * filtering for the active history pane. Part of the module's public API.
 */
export type GitHistorySearchHandle = {
  setQuery: (query: string) => void;
  clearQuery: () => void;
};

/** Lifecycle state of the paginated commit-log fetch. */
export type LoadStatus = "idle" | "initial" | "more" | "error";

/** Per-commit file-list cache entry: loading, loaded, or errored. */
export type FilesEntry =
  | { state: "loading" }
  | { state: "loaded"; files: GitCommitFileChange[] }
  | { state: "error"; error: string };
