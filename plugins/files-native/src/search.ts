/**
 * File-name search.
 * fs_list_files (gitignore-aware file list, via `rg --files`) + fs_search
 * (fuzzy-ranked, via fuzzy.ts).
 */
import { statSync } from "node:fs";
import { basename, join } from "node:path";
import { rankFuzzy } from "./fuzzy";
import { runRg } from "./rg";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { resolvePath, toCanon } from "./runtime";

const MAX_SCANNED = 50_000;
const PRUNE_DIRS = [
  "node_modules", ".git", "target", "dist", "build", ".next", ".turbo",
  ".cache", ".venv", "__pycache__",
];

export interface SearchHit {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
}
export interface SearchResult {
  hits: SearchHit[];
  truncated: boolean;
}
export interface ListFilesResult {
  files: string[];
  truncated: boolean;
}

function pruneArgs(): string[] {
  return PRUNE_DIRS.flatMap((d) => ["-g", `!${d}`]);
}

function requireDir(root: string): void {
  let ok = false;
  try {
    ok = statSync(root).isDirectory();
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`not a directory: ${root}`);
}

async function rgFiles(
  root: string,
  showHidden: boolean,
  maxDepth?: number,
): Promise<string[]> {
  const args = ["--files", ...pruneArgs()];
  if (showHidden) args.push("--hidden");
  if (maxDepth != null) args.push("--max-depth", String(maxDepth));
  const { stdout } = await runRg(args, root);
  return stdout.split("\n").map((l) => toCanon(l.trim())).filter(Boolean);
}

export async function fsListFiles(
  root: string,
  limit: number | undefined,
  maxDepth: number | undefined,
  workspace: WorkspaceEnv,
  showHidden: boolean | undefined,
): Promise<ListFilesResult> {
  const cap = Math.min(Math.max(limit ?? 2000, 1), 10000);
  const depth = Math.min(Math.max(maxDepth ?? 8, 1), 16);
  const rootPath = resolvePath(root, workspace);
  requireDir(rootPath);

  const all = await rgFiles(rootPath, showHidden ?? false, depth);
  let truncated = false;
  let files = all;
  if (files.length > cap) {
    files = files.slice(0, cap);
    truncated = true;
  }
  files.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  return { files, truncated };
}

export async function fsSearch(
  root: string,
  query: string,
  limit: number | undefined,
  workspace: WorkspaceEnv,
  showHidden: boolean | undefined,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { hits: [], truncated: false };
  const cap = Math.min(limit ?? 200, 1000);
  const rootPath = resolvePath(root, workspace);
  requireDir(rootPath);

  const files = await rgFiles(rootPath, showHidden ?? false);
  const truncated = files.length > MAX_SCANNED;

  const cands: SearchHit[] = [];
  const seenDirs = new Set<string>();
  for (const rel of files) {
    cands.push({
      path: toCanon(join(rootPath, rel)),
      rel,
      name: basename(rel),
      is_dir: false,
    });
    // Derive unique parent directories as dir hits (the walk yields dirs too).
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirRel = parts.slice(0, i).join("/");
      if (seenDirs.has(dirRel)) continue;
      seenDirs.add(dirRel);
      cands.push({
        path: toCanon(join(rootPath, dirRel)),
        rel: dirRel,
        name: basename(dirRel),
        is_dir: true,
      });
    }
  }

  const hits = rankFuzzy(cands, q, cap);
  return { hits, truncated };
}
