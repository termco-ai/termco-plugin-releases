/**
 * History index: reads zsh/bash/fish histories + scans PATH, builds the in-memory
 * index, and serves suggest/commands/list/record.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  buildIndex,
  completeCommands,
  demetafy,
  list,
  parseBash,
  parseFish,
  parseZsh,
  sortRecent,
  suggest,
  type HistEntry,
} from "./parse";

interface Index {
  entries: HistEntry[];
  pathCmds: string[];
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

export function zshHistfile(home: string | null, histfile: string | null): string | null {
  if (histfile && exists(histfile)) return histfile;
  return home ? join(home, ".zsh_history") : null;
}

export function fishHistfile(home: string | null, xdgData: string | null): string | null {
  if (xdgData) {
    const pb = join(xdgData, "fish/fish_history");
    if (exists(pb)) return pb;
  }
  return home ? join(home, ".local/share/fish/fish_history") : null;
}

export function readHistoriesFrom(
  home: string | null,
  histfile: string | null,
  xdgData: string | null,
): [string, number][] {
  const all: [string, number][] = [];
  const zsh = zshHistfile(home, histfile);
  if (zsh) {
    try {
      const content = Buffer.from(demetafy(readFileSync(zsh))).toString("utf8");
      all.push(...parseZsh(content));
    } catch {
      /* skip */
    }
  }
  if (home) {
    try {
      all.push(...parseBash(readFileSync(join(home, ".bash_history"), "utf8")));
    } catch {
      /* skip */
    }
  }
  const fish = fishHistfile(home, xdgData);
  if (fish) {
    try {
      all.push(...parseFish(readFileSync(fish, "utf8")));
    } catch {
      /* skip */
    }
  }
  return all;
}

function readHistories(): [string, number][] {
  return readHistoriesFrom(
    homedir() || null,
    process.env.HISTFILE ?? null,
    process.env.XDG_DATA_HOME ?? null,
  );
}

export function isExecutable(dir: string, name: string): boolean {
  if (process.platform === "win32") {
    const lower = name.toLowerCase();
    return [".exe", ".cmd", ".bat", ".com", ".ps1"].some((e) => lower.endsWith(e));
  }
  try {
    const st = statSync(join(dir, name));
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function scanDirs(dirs: string[]): string[] {
  const set = new Set<string>();
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (isExecutable(dir, name)) set.add(name);
    }
  }
  return [...set].sort();
}

function scanPath(): string[] {
  const raw = process.env.PATH ?? "";
  return scanDirs(raw.split(delimiter).filter(Boolean));
}

// ---- async twins (startup prewarm; syscalls yield to the event loop) ----

async function readHistoriesAsync(): Promise<[string, number][]> {
  const home = homedir() || null;
  const all: [string, number][] = [];
  const zsh = zshHistfile(home, process.env.HISTFILE ?? null);
  if (zsh) {
    try {
      all.push(...parseZsh(Buffer.from(demetafy(await readFile(zsh))).toString("utf8")));
    } catch {
      /* skip */
    }
  }
  if (home) {
    try {
      all.push(...parseBash(await readFile(join(home, ".bash_history"), "utf8")));
    } catch {
      /* skip */
    }
  }
  const fish = fishHistfile(home, process.env.XDG_DATA_HOME ?? null);
  if (fish) {
    try {
      all.push(...parseFish(await readFile(fish, "utf8")));
    } catch {
      /* skip */
    }
  }
  return all;
}

async function isExecutableAsync(dir: string, name: string): Promise<boolean> {
  if (process.platform === "win32") {
    const lower = name.toLowerCase();
    return [".exe", ".cmd", ".bat", ".com", ".ps1"].some((e) => lower.endsWith(e));
  }
  try {
    const st = await stat(join(dir, name));
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

async function scanPathAsync(): Promise<string[]> {
  const raw = process.env.PATH ?? "";
  const set = new Set<string>();
  for (const dir of raw.split(delimiter).filter(Boolean)) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (await isExecutableAsync(dir, name)) set.add(name);
    }
  }
  return [...set].sort();
}

export class HistoryState {
  #index: Index | null = null;
  #loader: () => Index;

  constructor(loader?: () => Index) {
    this.#loader = loader ?? (() => ({ entries: buildIndex(readHistories()), pathCmds: scanPath() }));
  }

  #ensure(): Index {
    if (!this.#index) this.#index = this.#loader();
    return this.#index;
  }

  /** Build the index ASYNC ahead of the first keystroke. The lazy sync build
   * stats every executable on $PATH and parses shell histories — done on the
   * main thread at first `history_suggest`, that was a visible input stall.
   * Prewarming at startup makes the first keystroke hit a warm index; the sync
   * loader remains only as a fallback for a keystroke racing the prewarm. */
  async prewarm(): Promise<void> {
    if (this.#index) return;
    const [entries, pathCmds] = await Promise.all([
      readHistoriesAsync().then(buildIndex),
      scanPathAsync(),
    ]);
    // A racing sync build may have landed meanwhile — keep it (it already
    // absorbed record() calls).
    if (!this.#index) this.#index = { entries, pathCmds };
  }

  suggest(line: string): string | null {
    return suggest(this.#ensure().entries, line);
  }

  commands(prefix: string, limit?: number): string[] {
    const idx = this.#ensure();
    return completeCommands(idx.entries, idx.pathCmds, prefix, limit ?? 50);
  }

  list(query: string, limit?: number): string[] {
    return list(this.#ensure().entries, query, limit ?? 200);
  }

  record(command: string): void {
    const cmd = command.trim();
    if (!cmd) return;
    const idx = this.#ensure();
    const n = nowSecs();
    const existing = idx.entries.find((e) => e.cmd === cmd);
    if (existing) {
      existing.count += 1;
      existing.last = n;
    } else {
      idx.entries.push({ cmd, count: 1, last: n });
    }
    sortRecent(idx.entries);
  }
}
