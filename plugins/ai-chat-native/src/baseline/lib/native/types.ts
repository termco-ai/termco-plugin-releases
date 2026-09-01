/**
 * Native bridge result/entry types.
 *
 * Owns every wire-shape `export type` returned by the `invoke`
 * commands in `./native` (filesystem, shell, and git responses). Pure type
 * declarations — no runtime code.
 */

export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number }
  // Only produced for reads sent with `optional: true` (probes for files
  // that legitimately may not exist, e.g. AGENTS.md).
  | { kind: "missing" };

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

export type StatResult = {
  size: number;
  mtime: number;
  kind: "file" | "directory" | "symlink" | string;
};

export type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

type GrepHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

export type GrepResponse = {
  hits: GrepHit[];
  truncated: boolean;
  files_scanned: number;
};

type GlobHit = { path: string; rel: string };
export type GlobResponse = { hits: GlobHit[]; truncated: boolean };

export type GitRepoInfo = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
};

export type GitChangedFile = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  truncated: boolean;
  changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
  diffText: string;
  truncated: boolean;
};

/** Why a side of the diff is what it is — see electron/main/git/operations.ts. */
export type DiffSideState = "ok" | "missing" | "binary";

export type GitDiffContentResult = {
  originalContent: string;
  modifiedContent: string;
  /** Absent on results cached by an older build. */
  originalState?: DiffSideState;
  modifiedState?: DiffSideState;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
};

export type GitCommitResult = {
  commitSha: string;
  summary: string;
};

export type GitPushResult = {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
};

export type GitLogEntry = {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type GitCommitFileChange = {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
};

export type GitPanelSnapshot = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
};

export type GitDiscardEntry = {
  path: string;
  untracked: boolean;
};

export type GitBranchEntry = {
  name: string;
  /** `remote` entries are named fully qualified, e.g. `origin/feature-x`. */
  kind: "local" | "worktree" | "remote";
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
  /** For a local branch: the remote ref it tracks, if any. */
  upstream?: string | null;
};

export type GitBranchListResult = {
  branches: GitBranchEntry[];
};

// --- embedded browser AI control -------------------------------------------

export type BrowserAiStatus =
  | { url: string; title: string; loading: boolean }
  | { error: string };

export type BrowserAiActionResult =
  | {
      ok: true;
      url: string;
      title?: string;
      scrollY?: number;
      docH?: number;
      viewportH?: number;
    }
  | { error: string; url?: string };

export type BrowserAiSnapshot =
  | {
      epoch: number;
      title: string;
      url: string;
      scrollY: number;
      viewportH: number;
      docH: number;
      text: string;
      truncated: boolean;
    }
  | { error: string };

export type BrowserAiScreenshot =
  | { ok: true; url: string; png: string; mediaType?: string }
  | { error: string };

export type BrowserConsoleEntry = {
  id: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  ts: number;
  stackTop?: string;
};

export type BrowserNetworkEntry = {
  id: number;
  requestId: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
  mimeType?: string;
  size?: number;
  durationMs?: number;
  failed?: boolean;
  errorText?: string;
  ts: number;
};

export type BrowserAiNetworkBody =
  | { body: string; base64: boolean }
  | { error: string };

export type BrowserAiEvaluate =
  | { ok: true; result: string }
  | { error: string };
