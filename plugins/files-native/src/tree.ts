/**
 * Directory listing.
 * fs_read_dir (dirs→symlinks→files, case-insensitive; hidden gated by dot-prefix)
 * and list_subdirs. NOTE: the `gitignored` git-decoration flag is deferred to a
 * follow-up (returns false); the `ignore`-crate walk is replaced then.
 *
 * Fully async: these run inside IPC handlers ON the main-process main thread,
 * and the old sync implementation (readdirSync + statSync loop + a synchronous
 * `git check-ignore` child) blocked the UI (beachball) on large directories and
 * cold caches. Every syscall now yields to the event loop.
 */
import { spawn } from "node:child_process";
import { lstat, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { resolvePath } from "./runtime";

export type EntryKind = "file" | "dir" | "symlink";

export interface DirEntry {
  name: string;
  kind: EntryKind;
  size: number;
  mtime: number;
  gitignored: boolean;
}

/** Walk up looking for a `.git` (never descends). */
function inGitRepo(dir: string): boolean {
  let cur = dir;
  for (;;) {
    if (existsSync(join(cur, ".git"))) return true;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

/** Immediate children git ignores (via `git check-ignore --stdin`), async —
 * the old spawnSync forked git ON the main thread per directory listing. */
function gitIgnoredNames(root: string, names: string[]): Promise<Set<string>> {
  return new Promise((resolve) => {
    const ignored = new Set<string>();
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", ["-C", root, "check-ignore", "--stdin"], {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      resolve(ignored);
      return;
    }
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
    });
    child.on("error", () => resolve(ignored));
    child.on("close", (status) => {
      // Exit 0 = some matched, 1 = none matched (both fine); >1 = error → none.
      if (status === 0 && out) {
        for (const line of out.split("\n")) {
          const name = line.trim();
          if (name) ignored.add(name);
        }
      }
      resolve(ignored);
    });
    child.stdin?.on("error", () => {
      /* EPIPE when git exits early — close handler still resolves */
    });
    child.stdin?.end(names.join("\n"));
  });
}

export async function fsReadDir(
  path: string,
  showHidden: boolean,
  gitDecorations: boolean | undefined,
  workspace: WorkspaceEnv,
): Promise<DirEntry[]> {
  // Defensive: a blank path resolves to "" and would `scandir ""` → a cryptic
  // ENOENT logged by ipcMain.handle. There is nothing to list, so return empty
  // quietly. (The real caller bug that produced "" lives in the frontend.)
  if (!path.trim()) return [];
  const root = resolvePath(path, workspace);
  const names = await readdir(root); // throws on non-dir/missing (parity)
  const visibleNames = showHidden ? names : names.filter((n) => !n.startsWith("."));
  const ignoredNames =
    gitDecorations && inGitRepo(root)
      ? await gitIgnoredNames(root, visibleNames)
      : new Set<string>();

  const entries: DirEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".") && !showHidden) continue;
    const full = join(root, name);
    let meta: Awaited<ReturnType<typeof stat>>;
    let wasSymlink: boolean;
    try {
      meta = await stat(full); // follows symlinks
      wasSymlink = false;
    } catch {
      try {
        meta = await lstat(full); // broken symlink → keep it in the listing
        wasSymlink = true;
      } catch {
        continue;
      }
    }

    const kind: EntryKind = wasSymlink
      ? "symlink"
      : meta.isDirectory()
        ? "dir"
        : "file";
    entries.push({
      name,
      kind,
      size: meta.size,
      mtime: Number.isFinite(meta.mtimeMs) ? Math.floor(meta.mtimeMs) : 0,
      gitignored: ignoredNames.has(name),
    });
  }

  const rank = (k: EntryKind) => (k === "dir" ? 0 : k === "symlink" ? 1 : 2);
  entries.sort((a, b) => {
    const r = rank(a.kind) - rank(b.kind);
    if (r !== 0) return r;
    return a.name.toLowerCase() < b.name.toLowerCase()
      ? -1
      : a.name.toLowerCase() > b.name.toLowerCase()
        ? 1
        : 0;
  });
  return entries;
}

export async function listSubdirs(
  path: string,
  showHidden: boolean,
  workspace: WorkspaceEnv,
): Promise<string[]> {
  if (!path.trim()) return []; // see fsReadDir — blank path has nothing to list
  const root = resolvePath(path, workspace);
  const names = await readdir(root);
  const dirs: string[] = [];
  for (const name of names) {
    if (!showHidden && name.startsWith(".")) continue;
    const full = join(root, name);
    try {
      const lst = await lstat(full);
      const isDir =
        lst.isDirectory() ||
        (lst.isSymbolicLink() && (await stat(full)).isDirectory());
      if (isDir) dirs.push(name);
    } catch {
      // unreadable entry — skip
    }
  }
  dirs.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  return dirs;
}
