/**
 * Disk persistence for session-summary caches. The RAM mtime-cache already makes
 * REPEATED scans free, but it dies with the process — so the first history
 * load after every app start re-parsed megabytes of JSONL (a visible CPU
 * spike). Persisting `{ path → { mtime, summary } }` across restarts means a
 * cold scan only parses transcripts whose mtime actually changed.
 *
 * Wiring is optional and injected (`initSummaryDiskCache` from index.ts, which
 * knows userData); without it everything degrades to RAM-only — unit tests and
 * non-Electron contexts need no special casing. Writes are debounced and async;
 * loading happens once, lazily, before the first scan that wants the cache.
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import type { AgentSessionSummary } from "@termco/agents-base";

type Entry = {
  mtime: number;
  summary: AgentSessionSummary;
  /** Incremental-parse state. Lets a refresh of a grown transcript parse only the
   * appended bytes instead of the whole file — the full re-parse of the live
   * CLI's ever-growing transcript on every watcher event was a sustained
   * ~100ms-per-30MB CPU burn while the history view was open. */
  inc?: unknown;
};

const FORMAT_VERSION = 1;
const SAVE_DEBOUNCE_MS = 2000;
/** Bound the file: keep the newest N entries per namespace on save. */
const MAX_ENTRIES_PER_NS = 1500;

const caches = new Map<string, Map<string, Entry>>();
let file: string | null = null;
let loadPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** The RAM cache map for a backend namespace. Always available;
 * disk load merges into these maps without replacing them. */
export function summaryCache(ns: string): Map<string, Entry> {
  let m = caches.get(ns);
  if (!m) {
    m = new Map();
    caches.set(ns, m);
  }
  return m;
}

/** Enable persistence to `path` (userData). Call once at registration. */
export function initSummaryDiskCache(path: string): void {
  file = path;
}

/** Await the one-time disk load (no-op when persistence is off/missing). Only
 * fills keys that aren't already in RAM — a live parse always wins. */
export function summaryCacheReady(): Promise<void> {
  if (!file) return Promise.resolve();
  loadPromise ??= readFile(file, "utf8")
    .then((raw) => {
      const data = JSON.parse(raw) as {
        version?: number;
        namespaces?: Record<string, Record<string, Entry>>;
      };
      if (data.version !== FORMAT_VERSION) return;
      for (const [ns, entries] of Object.entries(data.namespaces ?? {})) {
        const m = summaryCache(ns);
        for (const [path, entry] of Object.entries(entries)) {
          if (!m.has(path)) m.set(path, entry);
        }
      }
    })
    .catch(() => {
      /* no/corrupt cache file — scans just run cold once */
    });
  return loadPromise;
}

async function saveNow(): Promise<void> {
  const target = file;
  if (!target) return;
  const namespaces: Record<string, Record<string, Entry>> = {};
  for (const [ns, m] of caches) {
    // Newest-first cap so the file can't grow without bound.
    const entries = [...m.entries()]
      .sort((a, b) => b[1].mtime - a[1].mtime)
      .slice(0, MAX_ENTRIES_PER_NS);
    namespaces[ns] = Object.fromEntries(entries);
  }
  const tmp = `${target}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify({ version: FORMAT_VERSION, namespaces }), "utf8");
    await rename(tmp, target);
  } catch {
    /* best effort */
  }
}

/** Schedule a debounced async save of all namespaces (no-op when off). */
export function scheduleSummaryCacheSave(): void {
  if (!file) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, SAVE_DEBOUNCE_MS);
}

/** Test seam: write pending state immediately (skips the debounce). */
export function flushSummaryCacheSaveForTests(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return saveNow();
}

/** Test seam: drop all state so specs start clean. */
export function resetSummaryDiskCacheForTests(): void {
  caches.clear();
  file = null;
  loadPromise = null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
// Owned by the coding-agent-native provider plugin.
