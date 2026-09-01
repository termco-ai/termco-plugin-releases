/**
 * Git operations (stage/commit/diff/sync/branch/remote/log). Registry
 * authorization gating is deferred to M5; here repo roots are locally
 * canonicalized.
 */
import type { WorkspaceEnv } from "@termco/workspace-base";
import { ensureSuccess, GitError } from "./errors";
import { pathspec, pathspecFromInput, resolvePathspecs, resolveWithinRepo } from "./pathspec";
import {
  canonicalDir,
  DEFAULT_TIMEOUT_SECS,
  ensureGitAvailable,
  gitStdoutLineOpt,
  gitStdoutLines,
  runGit,
  type GitOutput,
} from "./runner";
import { gitShowText, intoText, readTextFile, type TextSource } from "./textSource";
import { authorize } from "./runtime";

const NETWORK_TIMEOUT_SECS = 120;
const MAX_LOG_LIMIT = 200;
const LOG_FORMAT = "%H%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s";

export interface DiscardEntry {
  path: string;
  untracked: boolean;
}
export interface GitCommitResult {
  commitSha: string;
  summary: string;
}
export interface GitCommitFileChange {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
}
export interface GitDiffResult {
  diffText: string;
  truncated: boolean;
}
/**
 * Why a side of the diff is what it is.
 *
 * `intoText` collapses "file is missing", "file is binary" and "file is
 * genuinely empty" into the same empty string. That made a failed read
 * indistinguishable from an empty file — so a broken read rendered as a
 * perfectly plausible "everything was deleted" diff instead of an error. The
 * viewer needs the reason to say something true.
 */
export type DiffSideState = "ok" | "missing" | "binary";

export interface GitDiffContentResult {
  originalContent: string;
  modifiedContent: string;
  originalState: DiffSideState;
  modifiedState: DiffSideState;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
}
export interface GitLogEntry {
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
}
export interface GitPushResult {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
}
export interface GitBranchEntry {
  name: string;
  kind: string;
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
  /** For a local branch: the remote ref it tracks, if any. */
  upstream?: string | null;
}
export interface GitBranchListResult {
  branches: GitBranchEntry[];
}

// ---- shared helpers -------------------------------------------------------
export function shaIsSafe(sha: string): boolean {
  return /^[0-9a-fA-F]{4,64}$/.test(sha);
}

export function splitUpstream(upstream: string): [string | null, string | null] {
  const idx = upstream.indexOf("/");
  if (idx < 0) return [null, upstream];
  return [upstream.slice(0, idx), upstream.slice(idx + 1)];
}

export function looksLikeNoHead(output: GitOutput): boolean {
  const s = output.stderr.toString("utf8").toLowerCase();
  return (
    s.includes("ambiguous argument 'head'") ||
    s.includes("unknown revision") ||
    s.includes("does not have any commits yet") ||
    s.includes("bad revision 'head'")
  );
}

export function nothingToCommit(output: GitOutput): boolean {
  const s = output.stderr.toString("utf8").toLowerCase();
  const o = output.stdout.toString("utf8").toLowerCase();
  return s.includes("nothing to commit") || o.includes("nothing to commit");
}

export function statusLabelFor(c: string): string {
  switch (c) {
    case "A": return "Added";
    case "M": return "Modified";
    case "D": return "Deleted";
    case "R": return "Renamed";
    case "C": return "Copied";
    case "T": return "Type changed";
    case "U": return "Unmerged";
    default: return `Status ${c}`;
  }
}

async function root(cwd: string, workspace: WorkspaceEnv): Promise<string> {
  // Route the repo root through the workspace registry: canonicalize + register
  // it (rejects non-existent paths). Mirrors authorized_repo_root's canonical
  // resolution; the registry is the shared authorization boundary.
  let r: string;
  try {
    r = authorize(cwd, workspace);
  } catch {
    r = canonicalDir(cwd);
  }
  await ensureGitAvailable(workspace);
  return r;
}

// ---- stage / unstage / discard --------------------------------------------
export async function stage(repoRoot: string, paths: string[], ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  if (paths.length === 0) return;
  const resolved = resolvePathspecs(r, paths);
  const output = await runGit(ws, r, ["add", "--", ...resolved], DEFAULT_TIMEOUT_SECS);
  ensureSuccess(output, "git add failed");
}

export async function unstage(repoRoot: string, paths: string[], ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  if (paths.length === 0) return;
  const resolved = resolvePathspecs(r, paths);
  const output = await runGit(ws, r, ["reset", "HEAD", "--", ...resolved], DEFAULT_TIMEOUT_SECS);
  if (output.exitCode === 0) return;
  if (!looksLikeNoHead(output)) {
    ensureSuccess(output, "git reset failed");
    return;
  }
  const rm = await runGit(ws, r, ["rm", "--cached", "-r", "--", ...resolved], DEFAULT_TIMEOUT_SECS);
  ensureSuccess(rm, "git rm --cached failed");
}

export async function discard(repoRoot: string, entries: DiscardEntry[], ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  if (entries.length === 0) return;
  const tracked: string[] = [];
  const untracked: string[] = [];
  for (const e of entries) {
    const spec = pathspecFromInput(r, e.path);
    (e.untracked ? untracked : tracked).push(spec);
  }
  if (tracked.length) {
    const out = await runGit(ws, r, ["restore", "--worktree", "--", ...tracked], DEFAULT_TIMEOUT_SECS);
    ensureSuccess(out, "git restore failed");
  }
  if (untracked.length) {
    const out = await runGit(ws, r, ["clean", "-f", "-d", "--", ...untracked], DEFAULT_TIMEOUT_SECS);
    ensureSuccess(out, "git clean failed");
  }
}

// ---- commit / commit files -------------------------------------------------
export async function commit(repoRoot: string, message: string, ws: WorkspaceEnv): Promise<GitCommitResult> {
  const r = await root(repoRoot, ws);
  const trimmed = message.trim();
  if (!trimmed) throw new GitError("commandFailed", "empty commit message");
  const output = await runGit(ws, r, ["commit", "-m", trimmed], DEFAULT_TIMEOUT_SECS);
  if (output.exitCode !== 0 && nothingToCommit(output)) {
    throw GitError.command("git commit", "nothing staged");
  }
  ensureSuccess(output, "git commit failed");
  const combined = await gitStdoutLines(ws, r, ["show", "-s", "--format=%H%n%s", "HEAD"]);
  const sha = combined[0];
  if (!sha) throw new GitError("commandFailed", "failed to resolve commit sha");
  return { commitSha: sha, summary: combined[1] ?? "" };
}

export function parseDiffTreeNameStatus(bytes: Buffer): GitCommitFileChange[] {
  const tokens = bytes.toString("utf8").split("\0").filter((t) => t.length > 0);
  const files: GitCommitFileChange[] = [];
  let i = 0;
  while (i < tokens.length) {
    const statusTok = tokens[i++];
    const statusChar = statusTok[0] ?? " ";
    if (statusChar === "R" || statusChar === "C") {
      const original = tokens[i++];
      const newPath = tokens[i++];
      if (original == null || newPath == null) break;
      files.push({ path: newPath, originalPath: original, status: statusChar, statusLabel: statusLabelFor(statusChar), added: 0, removed: 0, isBinary: false });
    } else {
      const path = tokens[i++];
      if (path == null) break;
      files.push({ path, originalPath: null, status: statusChar, statusLabel: statusLabelFor(statusChar), added: 0, removed: 0, isBinary: false });
    }
  }
  return files;
}

export function applyNumstat(files: GitCommitFileChange[], bytes: Buffer): void {
  const tokens = bytes.toString("utf8").split("\0").filter((t) => t.length > 0);
  const stats = new Map<string, { added: number; removed: number; isBinary: boolean; original: string | null }>();
  let i = 0;
  while (i < tokens.length) {
    const header = tokens[i++];
    const cols = header.split("\t");
    const addedRaw = cols[0] ?? "0";
    const removedRaw = cols[1] ?? "0";
    const inlinePath = cols.slice(2).join("\t");
    const isBinary = addedRaw === "-" && removedRaw === "-";
    const added = isBinary ? 0 : Number.parseInt(addedRaw, 10) || 0;
    const removed = isBinary ? 0 : Number.parseInt(removedRaw, 10) || 0;
    let path: string;
    let original: string | null;
    if (inlinePath === "") {
      original = tokens[i++] ?? "";
      path = tokens[i++] ?? "";
    } else {
      path = inlinePath;
      original = null;
    }
    if (!path) continue;
    stats.set(path, { added, removed, isBinary, original });
  }
  for (const file of files) {
    const entry = stats.get(file.path);
    if (!entry) continue;
    file.added = entry.added;
    file.removed = entry.removed;
    file.isBinary = entry.isBinary;
    if (file.originalPath == null && entry.original && entry.original !== file.path) {
      file.originalPath = entry.original;
    }
  }
}

export async function commitFiles(repoRoot: string, sha: string, ws: WorkspaceEnv): Promise<GitCommitFileChange[]> {
  const r = await root(repoRoot, ws);
  if (!shaIsSafe(sha)) throw GitError.command("git diff-tree", "invalid commit sha");
  const ns = await runGit(ws, r, ["diff-tree", "--no-commit-id", "-r", "-z", "-M", "--name-status", sha], DEFAULT_TIMEOUT_SECS);
  ensureSuccess(ns, "git diff-tree failed");
  const files = parseDiffTreeNameStatus(ns.stdout);
  if (files.length === 0) return files;
  const numstat = await runGit(ws, r, ["diff-tree", "--no-commit-id", "-r", "-z", "-M", "--numstat", sha], DEFAULT_TIMEOUT_SECS);
  ensureSuccess(numstat, "git diff-tree failed");
  applyNumstat(files, numstat.stdout);
  return files;
}

export async function commitFileDiff(repoRoot: string, sha: string, path: string, originalPath: string | undefined, ws: WorkspaceEnv): Promise<GitDiffContentResult> {
  const r = await root(repoRoot, ws);
  if (!shaIsSafe(sha)) throw GitError.command("git show", "invalid commit sha");
  const rel = pathspec(r, resolveWithinRepo(r, path));
  const originalRel = originalPath ? pathspec(r, resolveWithinRepo(r, originalPath)) : rel;
  const parent = await gitStdoutLineOpt(ws, r, ["rev-parse", `${sha}^`]);
  const original: TextSource = parent ? await gitShowText(ws, r, `${parent}:${originalRel}`) : { kind: "missing" };
  const modified = await gitShowText(ws, r, `${sha}:${rel}`);
  const diffArgs = ["show", "--no-color", "--no-ext-diff", "--format=", "-m", "--first-parent", sha, "--", rel];
  if (originalRel !== rel) diffArgs.push(originalRel);
  const patch = await runGit(ws, r, diffArgs, DEFAULT_TIMEOUT_SECS);
  ensureSuccess(patch, "git show <commit> -- <path> failed");
  return {
    originalContent: intoText(original),
    modifiedContent: intoText(modified),
    originalState: sideState(original),
    modifiedState: sideState(modified),
    isBinary: original.kind === "binary" || modified.kind === "binary",
    fallbackPatch: patch.stdout.toString("utf8"),
    truncated: patch.truncated,
  };
}

/** The reason behind a side, kept alongside the text `intoText` flattens. */
function sideState(src: TextSource): DiffSideState {
  return src.kind === "text" ? "ok" : src.kind;
}

// ---- diff ------------------------------------------------------------------
async function diffInner(r: string, path: string | undefined, staged: boolean, ws: WorkspaceEnv): Promise<GitDiffResult> {
  const args = ["diff", "--no-ext-diff"];
  if (staged) args.push("--cached");
  const spec = path ? pathspecFromInput(r, path) : null;
  if (spec) args.push("--", spec);
  const output = await runGit(ws, r, args, DEFAULT_TIMEOUT_SECS);
  ensureSuccess(output, "git diff failed");
  return { diffText: output.stdout.toString("utf8"), truncated: output.truncated };
}

export async function diff(repoRoot: string, path: string | undefined, staged: boolean, ws: WorkspaceEnv): Promise<GitDiffResult> {
  const r = await root(repoRoot, ws);
  return diffInner(r, path && path.length ? path : undefined, staged, ws);
}

export async function diffContent(repoRoot: string, path: string, staged: boolean, originalPath: string | undefined, ws: WorkspaceEnv): Promise<GitDiffContentResult> {
  const r = await root(repoRoot, ws);
  const worktreePath = resolveWithinRepo(r, path);
  const relPath = pathspec(r, worktreePath);
  const originalRel = originalPath ? pathspec(r, resolveWithinRepo(r, originalPath)) : null;
  const original = staged
    ? await gitShowText(ws, r, `HEAD:${originalRel ?? relPath}`)
    : await gitShowText(ws, r, `:${relPath}`);
  // `ws` is load-bearing: on an SSH rig the working copy lives on the remote,
  // and reading it locally is what made every unstaged diff look like a full
  // deletion.
  const modified = staged
    ? await gitShowText(ws, r, `:${relPath}`)
    : await readTextFile(ws, worktreePath);
  const patch = await diffInner(r, relPath, staged, ws);
  return {
    originalContent: intoText(original),
    modifiedContent: intoText(modified),
    originalState: sideState(original),
    modifiedState: sideState(modified),
    isBinary: original.kind === "binary" || modified.kind === "binary",
    fallbackPatch: patch.diffText,
    truncated: patch.truncated,
  };
}

// ---- sync ------------------------------------------------------------------
export async function push(repoRoot: string, ws: WorkspaceEnv): Promise<GitPushResult> {
  const r = await root(repoRoot, ws);
  const upstream = await gitStdoutLineOpt(ws, r, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream) throw new GitError("commandFailed", "no upstream configured");
  const output = await runGit(ws, r, ["push"], NETWORK_TIMEOUT_SECS);
  ensureSuccess(output, "git push failed");
  const [remote, branch] = splitUpstream(upstream);
  return { remote, branch, pushed: true };
}

export async function fetch(repoRoot: string, ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  ensureSuccess(await runGit(ws, r, ["fetch", "--prune"], NETWORK_TIMEOUT_SECS), "git fetch failed");
}

export async function pullFfOnly(repoRoot: string, ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  ensureSuccess(await runGit(ws, r, ["pull", "--ff-only"], NETWORK_TIMEOUT_SECS), "git pull --ff-only failed");
}

// ---- branch ----------------------------------------------------------------
export function pushWorktree(branches: GitBranchEntry[], path: string, branch: string | null, headSha: string | null): void {
  let name: string;
  if (branch) name = branch;
  else if (headSha) name = `(detached @ ${headSha.length >= 7 ? headSha.slice(0, 7) : headSha})`;
  else return;
  branches.push({ name, kind: "worktree", worktreePath: path, isHead: false, isDetached: branch == null });
}

export async function listBranches(repoRoot: string, ws: WorkspaceEnv): Promise<GitBranchListResult> {
  const r = await root(repoRoot, ws);
  const branches: GitBranchEntry[] = [];
  const current = await gitStdoutLineOpt(ws, r, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => null);
  const isDetachedHead = current === "HEAD";
  const localNames = new Set<string>();
  for (const line of await gitStdoutLines(ws, r, ["branch", "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)"])) {
    const [name, headMarker, upstream] = line.split("\0");
    if (name) {
      const isHead = headMarker === "*";
      localNames.add(name);
      branches.push({ name, kind: "local", worktreePath: null, isHead, isDetached: isHead && isDetachedHead, upstream: upstream || null });
    }
  }
  // Remote-tracking refs. `for-each-ref` is used rather than `git branch -r`
  // because it never decorates the output ("-> " for symrefs, leading spaces).
  // A remote whose short name already exists locally is dropped: checking it
  // out would land on the local branch anyway, so listing both is noise.
  for (const name of await gitStdoutLines(ws, r, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"])) {
    if (!name) continue;
    const [, short] = splitUpstream(name);
    // `origin/HEAD` is a symbolic pointer at the default branch, not a branch.
    if (short === "HEAD" || short == null) continue;
    if (localNames.has(short)) continue;
    branches.push({ name, kind: "remote", worktreePath: null, isHead: false, isDetached: false, upstream: null });
  }
  // worktree list
  let curWt: string | null = null, wtBranch: string | null = null, wtBare = false, headSha: string | null = null;
  const flush = () => { if (curWt && !wtBare) pushWorktree(branches, curWt, wtBranch, headSha); };
  for (const line of await gitStdoutLines(ws, r, ["worktree", "list", "--porcelain"])) {
    if (line.startsWith("worktree ")) { flush(); curWt = line.slice(9).trim(); wtBranch = null; wtBare = false; headSha = null; }
    else if (line.startsWith("HEAD ")) headSha = line.slice(5).trim();
    else if (line.startsWith("branch ")) { const raw = line.slice(7).trim(); wtBranch = raw.startsWith("refs/heads/") ? raw.slice("refs/heads/".length) : raw; }
    else if (line.startsWith("bare")) wtBare = true;
  }
  flush();
  // dedupe (prefer worktree over local except current)
  const seen = new Map<string, number>();
  const deduped: GitBranchEntry[] = [];
  for (const b of branches) {
    const existingIdx = seen.get(b.name);
    if (existingIdx != null) {
      const existing = deduped[existingIdx];
      if (b.kind === "worktree" && existing.kind === "local" && existing.worktreePath == null && !existing.isHead) {
        deduped[existingIdx] = { ...b, isHead: existing.isHead || b.isHead };
      } else if (b.isHead && !existing.isHead) {
        deduped[existingIdx] = { ...existing, isHead: true };
      }
    } else {
      seen.set(b.name, deduped.length);
      deduped.push(b);
    }
  }
  const kindRank = (k: string) => (k === "local" ? 0 : k === "worktree" ? 1 : 2);
  deduped.sort((a, b) => {
    const ka = kindRank(a.kind);
    const kb = kindRank(b.kind);
    return ka !== kb ? ka - kb : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return { branches: deduped };
}

/**
 * Checking out `origin/feature-x` verbatim lands in detached HEAD, which is
 * never what someone picking a remote branch from a list means. So: if a local
 * branch of that short name exists, switch to it; otherwise create a tracking
 * branch. `git switch --track` is the modern spelling, `checkout -b --track`
 * the fallback for git < 2.23.
 */
export async function checkoutBranch(repoRoot: string, branchName: string, ws: WorkspaceEnv): Promise<void> {
  const r = await root(repoRoot, ws);
  if (!branchName || branchName.startsWith("-")) throw new GitError("commandFailed", `invalid path: ${branchName}`);

  const [remote, short] = splitUpstream(branchName);
  const isRemoteRef =
    remote != null &&
    short != null &&
    short !== "HEAD" &&
    (await gitStdoutLines(ws, r, ["remote"]).catch((): string[] => [])).includes(remote);

  if (!isRemoteRef) {
    ensureSuccess(await runGit(ws, r, ["checkout", branchName], DEFAULT_TIMEOUT_SECS), "git checkout failed");
    return;
  }

  // A local branch of the same name already exists — plain checkout, so we
  // don't fail with "branch already exists".
  const localExists = (await gitStdoutLines(ws, r, ["branch", "--format=%(refname:short)"]).catch((): string[] => [])).includes(short);
  if (localExists) {
    ensureSuccess(await runGit(ws, r, ["checkout", short], DEFAULT_TIMEOUT_SECS), "git checkout failed");
    return;
  }

  const viaSwitch = await runGit(ws, r, ["switch", "--track", branchName], DEFAULT_TIMEOUT_SECS);
  if (viaSwitch.exitCode === 0 && !viaSwitch.timedOut) return;
  ensureSuccess(
    await runGit(ws, r, ["checkout", "-b", short, "--track", branchName], DEFAULT_TIMEOUT_SECS),
    "git checkout failed",
  );
}

// ---- remote ----------------------------------------------------------------
export function isRemoteNameChar(c: string): boolean {
  return /[A-Za-z0-9]/.test(c) || c === "-" || c === "_" || c === ".";
}

export async function remoteUrl(repoRoot: string, name: string, ws: WorkspaceEnv): Promise<string | null> {
  const r = await root(repoRoot, ws);
  if (!name || name.length > 64 || ![...name].every(isRemoteNameChar)) return null;
  return gitStdoutLineOpt(ws, r, ["config", "--get", `remote.${name}.url`]);
}

// ---- log -------------------------------------------------------------------
export function parseShortstat(tail: string): [number, number, number] {
  for (const line of tail.split("\n")) {
    const trimmed = line.trim();
    if (!(trimmed.includes("file changed") || trimmed.includes("files changed"))) continue;
    let files = 0, ins = 0, del = 0;
    for (const part of trimmed.split(",")) {
      const p = part.trim();
      const n = Number.parseInt(p.split(/\s+/)[0] ?? "0", 10) || 0;
      if (p.includes("file")) files = n;
      else if (p.includes("insertion")) ins = n;
      else if (p.includes("deletion")) del = n;
    }
    return [files, ins, del];
  }
  return [0, 0, 0];
}

export async function log(repoRoot: string, limit: number, beforeSha: string | undefined, ws: WorkspaceEnv): Promise<GitLogEntry[]> {
  const r = await root(repoRoot, ws);
  const bounded = Math.min(Math.max(limit, 1), MAX_LOG_LIMIT);
  const args = ["log", "--no-color", "--shortstat", `--max-count=${bounded}`, `--format=${LOG_FORMAT}`];
  if (beforeSha) {
    if (!shaIsSafe(beforeSha)) throw GitError.command("git log", "invalid cursor sha");
    args.push(`${beforeSha}^`);
  }
  const output = await runGit(ws, r, args, DEFAULT_TIMEOUT_SECS);
  if (output.timedOut) throw new GitError("timedOut", "git log timed out");
  if (output.exitCode !== 0) {
    const stderr = output.stderr.toString("utf8").toLowerCase();
    if (stderr.includes("does not have any commits yet") || stderr.includes("bad default revision") || stderr.includes("unknown revision") || stderr.includes("ambiguous argument 'head'")) {
      return [];
    }
    ensureSuccess(output, "git log failed");
    return [];
  }
  const entries: GitLogEntry[] = [];
  for (const rawLine of output.stdout.toString("utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) continue;
    if (line.includes("\x1f")) {
      const fields = line.split("\x1f");
      const sha = fields[0] ?? "";
      if (!shaIsSafe(sha)) continue;
      entries.push({
        sha,
        shortSha: sha.slice(0, 7),
        author: fields[1] ?? "",
        authorEmail: fields[2] ?? "",
        timestampSecs: Number.parseInt(fields[3] ?? "0", 10) || 0,
        parents: (fields[4] ?? "").split(/\s+/).filter(Boolean),
        subject: fields[5] ?? "",
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      });
    } else if (entries.length && (line.includes("file changed") || line.includes("files changed"))) {
      const [f, ins, del] = parseShortstat(line);
      const cur = entries[entries.length - 1];
      cur.filesChanged = f;
      cur.insertions = ins;
      cur.deletions = del;
    }
  }
  return entries;
}

export async function showCommitDiff(repoRoot: string, sha: string, ws: WorkspaceEnv): Promise<GitDiffResult> {
  const r = await root(repoRoot, ws);
  if (!shaIsSafe(sha)) throw GitError.command("git show", "invalid commit identifier");
  const output = await runGit(ws, r, ["show", "--no-color", "--no-ext-diff", "--patch-with-stat", sha, "--"], DEFAULT_TIMEOUT_SECS);
  ensureSuccess(output, "git show failed");
  return { diffText: output.stdout.toString("utf8"), truncated: output.truncated };
}
