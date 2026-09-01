/**
 * Filesystem watching via chokidar. Non-recursive, refcounted per canonical
 * dir, debounced (150ms quiet
 * gap, 1000ms max window), emits `fs:changed` { paths } with canonical paths.
 * Access-only events are ignored (chokidar doesn't emit them).
 */
import chokidar, { type FSWatcher } from "chokidar";
import { realpathSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { registry, resolvePath, toCanon } from "./runtime";

const DEBOUNCE_MS = 150;
const MAX_WINDOW_MS = 1000;

const SKIP_DIRS = new Set([
  ".git", ".hg", ".svn", ".jj",
  "node_modules", "bower_components", ".pnpm-store", ".yarn", "dist", "build",
  "out", ".next", ".nuxt", ".svelte-kit", ".astro", ".vite", ".turbo",
  ".parcel-cache", ".angular", ".vercel", ".netlify", ".output", ".cache",
  "target",
  "__pycache__", ".venv", "venv", ".tox", ".nox", ".mypy_cache",
  ".pytest_cache", ".ruff_cache", ".ipynb_checkpoints", ".eggs",
  ".gradle", "obj", "vendor", "_build", "deps", ".dart_tool",
  "dist-newstyle", ".stack-work", ".build", "zig-cache", "zig-out",
  "cmake-build-debug", "cmake-build-release",
  ".idea", "coverage", ".nyc_output", ".terraform",
]);

interface Entry {
  watcher: FSWatcher;
  refCount: number;
}

const watched = new Map<string, Entry>();

// Shared debounce batch across every watcher (mirrors the single drain loop).
let batch = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let windowStart = 0;
let emitFn: ((event: string, payload: unknown) => void) | null = null;

function scheduleFlush(): void {
  const now = Date.now();
  if (flushTimer) {
    clearTimeout(flushTimer);
    // Cap total latency under a sustained stream (MAX_WINDOW).
    if (now - windowStart >= MAX_WINDOW_MS) {
      flush();
      return;
    }
  } else {
    windowStart = now;
  }
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (batch.size === 0) return;
  const paths = [...batch];
  batch = new Set();
  emitFn?.("fs:changed", { paths });
}

function record(changedPath: string): void {
  batch.add(toCanon(changedPath));
  scheduleFlush();
}

function canonicalDir(raw: string, workspace: WorkspaceEnv): string | null {
  const resolved = resolvePath(raw, workspace);
  let canonical: string;
  try {
    canonical = realpathSync(resolved);
  } catch {
    return null;
  }
  try {
    if (!statSync(canonical).isDirectory()) return null;
  } catch {
    return null;
  }
  if (SKIP_DIRS.has(basename(canonical))) return null;
  // prepare_add gated on registry.is_authorized; register the watched dir.
  try {
    registry.authorize(canonical);
  } catch {
    /* ignore */
  }
  return canonical;
}

export function fsWatchAdd(
  paths: string[],
  workspace: WorkspaceEnv,
  emit: (event: string, payload: unknown) => void,
): void {
  emitFn = emit;
  for (const raw of paths) {
    const canonical = canonicalDir(raw, workspace);
    if (!canonical) continue;
    const existing = watched.get(canonical);
    if (existing) {
      existing.refCount += 1;
      continue;
    }
    const watcher = chokidar.watch(canonical, {
      depth: 0, // NonRecursive: this dir + immediate children only
      ignoreInitial: true,
      ignored: (p: string) => SKIP_DIRS.has(basename(p)),
      followSymlinks: false,
    });
    for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"]) {
      watcher.on(ev, (p: string) => record(p));
    }
    watched.set(canonical, { watcher, refCount: 1 });
  }
}

export function fsWatchRemove(paths: string[], workspace: WorkspaceEnv): void {
  for (const raw of paths) {
    const resolved = resolvePath(raw, workspace);
    let key = resolved;
    try {
      key = realpathSync(resolved);
    } catch {
      // removed/renamed dir no longer canonicalizes — release by resolved path
    }
    const entry = watched.get(key);
    if (!entry) continue;
    if (entry.refCount <= 1) {
      void entry.watcher.close();
      watched.delete(key);
    } else {
      entry.refCount -= 1;
    }
  }
}

export async function fsWatchCloseAll(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  batch.clear();
  const closing = [...watched.values()].map((entry) => entry.watcher.close());
  watched.clear();
  await Promise.all(closing);
}
