/**
 * Content search via the ripgrep binary (--json). fs_grep, fs_grep_interactive,
 * fs_glob.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { runRg } from "./rg";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { resolvePath, toCanon } from "./runtime";

const DEFAULT_MAX_RESULTS = 200;
const HARD_MAX_RESULTS = 2000;

export interface GrepHit {
  path: string;
  rel: string;
  line: number;
  text: string;
}
export interface GrepResponse {
  hits: GrepHit[];
  truncated: boolean;
  files_scanned: number;
}
export interface GlobHit {
  path: string;
  rel: string;
}
export interface GlobResponse {
  hits: GlobHit[];
  truncated: boolean;
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

export async function fsGrep(
  pattern: string,
  root: string,
  glob: string[] | undefined,
  caseInsensitive: boolean | undefined,
  maxResults: number | undefined,
  workspace: WorkspaceEnv,
): Promise<GrepResponse> {
  if (!pattern) throw new Error("empty pattern");
  const rootPath = resolvePath(root, workspace);
  const cap = Math.min(Math.max(maxResults ?? DEFAULT_MAX_RESULTS, 1), HARD_MAX_RESULTS);

  const args = ["--json", "--line-number", "--max-filesize", "5M"];
  if (caseInsensitive) args.push("-i");
  for (const g of glob ?? []) args.push("-g", g);
  // An explicit path is required when the provider runs under Electron/IPC:
  // child stdin is a pipe, so ripgrep otherwise treats it as the search input
  // and waits forever instead of walking the working directory.
  args.push("-e", pattern, ".");

  const { stdout } = await runRg(args, rootPath);
  const hits: GrepHit[] = [];
  let filesScanned = 0;
  let truncated = false;

  for (const line of stdout.split("\n")) {
    if (!line) continue;
    let msg: {
      type: string;
      data?: {
        path?: { text?: string };
        line_number?: number;
        lines?: { text?: string };
      };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.type === "begin") {
      filesScanned += 1;
      continue;
    }
    if (msg.type !== "match" || !msg.data) continue;
    const rawRel = msg.data.path?.text;
    if (rawRel == null) continue;
    const rel = rawRel.replace(/^\.[/\\]/, "");
    if (hits.length >= cap) {
      truncated = true;
      break;
    }
    hits.push({
      path: toCanon(join(rootPath, rel)),
      rel: toCanon(rel),
      line: msg.data.line_number ?? 0,
      text: (msg.data.lines?.text ?? "").replace(/\r?\n$/, ""),
    });
  }

  return { hits, truncated, files_scanned: filesScanned };
}

// The interactive variant debounces/cancels the prior in-flight search. We kill
// the previous rg on each new call so a fast typist doesn't stack processes.
let interactiveToken = 0;
export async function fsGrepInteractive(
  pattern: string,
  root: string,
  maxResults: number | undefined,
  workspace: WorkspaceEnv,
): Promise<GrepResponse> {
  const token = ++interactiveToken;
  const result = await fsGrep(pattern, root, undefined, undefined, maxResults, workspace);
  // A newer query superseded this one — return empty so stale hits don't render.
  if (token !== interactiveToken) {
    return { hits: [], truncated: false, files_scanned: 0 };
  }
  return result;
}

export async function fsGlob(
  pattern: string,
  root: string,
  maxResults: number | undefined,
  workspace: WorkspaceEnv,
): Promise<GlobResponse> {
  if (!pattern) throw new Error("empty pattern");
  const rootPath = resolvePath(root, workspace);
  requireDir(rootPath);
  const cap = Math.min(Math.max(maxResults ?? 500, 1), HARD_MAX_RESULTS);

  const { stdout } = await runRg(["--files", "-g", pattern], rootPath);
  const rels = stdout.split("\n").map((l) => toCanon(l.trim())).filter(Boolean);
  let truncated = false;
  const hits: GlobHit[] = [];
  for (const rel of rels) {
    if (hits.length >= cap) {
      truncated = true;
      break;
    }
    hits.push({ path: toCanon(join(rootPath, rel)), rel });
  }
  return { hits, truncated };
}
