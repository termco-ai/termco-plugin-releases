/**
 * Remote search implementation owned by the SSH provider's Termco Server.
 * but spawns the REMOTE host's own `rg` (falling back to `grep`/`find` when it's
 * absent), and reuses the pure `rankFuzzy` ranker. Result shapes are identical so
 * the renderer's search UI is unchanged over ssh.
 */
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { rankFuzzy } from "./runtime/files/fuzzy";

export interface GrepHit { path: string; rel: string; line: number; text: string }
export interface GrepResponse { hits: GrepHit[]; truncated: boolean; files_scanned: number }
export interface GlobHit { path: string; rel: string }
export interface GlobResponse { hits: GlobHit[]; truncated: boolean }
export interface SearchHit { path: string; rel: string; name: string; is_dir: boolean }
export interface SearchResult { hits: SearchHit[]; truncated: boolean }
export interface ListFilesResult { files: string[]; truncated: boolean }

const PRUNE_DIRS = [
  "node_modules", ".git", "target", "dist", "build", ".next", ".turbo", ".cache", ".venv", "__pycache__",
];
const MAX_SCANNED = 50_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

type Run = { stdout: string; code: number | null; spawnError: boolean };
function run(bin: string, args: string[], cwd?: string, maxBytes = 16 * 1024 * 1024): Promise<Run> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { cwd, env: { ...process.env, LC_ALL: "C" } });
    } catch {
      resolve({ stdout: "", code: null, spawnError: true });
      return;
    }
    let stdout = "";
    let total = 0;
    let killed = false;
    child.stdout.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        if (!killed) {
          killed = true;
          child.kill();
        }
        return;
      }
      stdout += c.toString("utf8");
    });
    child.on("error", () => resolve({ stdout, code: null, spawnError: true }));
    child.on("close", (code) => resolve({ stdout, code, spawnError: false }));
  });
}

let rgAvail: boolean | null = null;
async function hasRg(): Promise<boolean> {
  if (rgAvail == null) {
    const r = await run("rg", ["--version"], undefined, 4096);
    rgAvail = !r.spawnError && r.code === 0;
  }
  return rgAvail;
}

const pruneRgArgs = () => PRUNE_DIRS.flatMap((d) => ["-g", `!${d}`]);
const pruneFindArgs = () =>
  PRUNE_DIRS.flatMap((d, i) => (i === 0 ? ["(", "-name", d] : ["-o", "-name", d]));

export async function grep(
  pattern: string,
  root: string,
  glob: string[] | undefined,
  caseInsensitive: boolean | undefined,
  maxResults: number | undefined,
): Promise<GrepResponse> {
  if (!pattern) throw new Error("empty pattern");
  const cap = clamp(maxResults ?? 200, 1, 2000);

  if (await hasRg()) {
    const args = ["--json", "--line-number", "--max-filesize", "5M"];
    if (caseInsensitive) args.push("-i");
    for (const g of glob ?? []) args.push("-g", g);
    args.push("-e", pattern);
    const { stdout } = await run("rg", args, root);
    const hits: GrepHit[] = [];
    let filesScanned = 0;
    let truncated = false;
    for (const line of stdout.split("\n")) {
      if (!line) continue;
      let msg: { type: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
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
      const rel = msg.data.path?.text;
      if (rel == null) continue;
      if (hits.length >= cap) {
        truncated = true;
        break;
      }
      hits.push({
        path: join(root, rel),
        rel,
        line: msg.data.line_number ?? 0,
        text: (msg.data.lines?.text ?? "").replace(/\r?\n$/, ""),
      });
    }
    return { hits, truncated, files_scanned: filesScanned };
  }

  // Fallback: grep -rnI (best-effort; no gitignore semantics).
  const args = ["-rnI", "--binary-files=without-match"];
  if (caseInsensitive) args.push("-i");
  for (const d of PRUNE_DIRS) args.push(`--exclude-dir=${d}`);
  args.push("-e", pattern, ".");
  const { stdout } = await run("grep", args, root);
  const hits: GrepHit[] = [];
  let truncated = false;
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const m = line.match(/^\.\/(.+?):(\d+):(.*)$/) ?? line.match(/^(.+?):(\d+):(.*)$/);
    if (!m) continue;
    if (hits.length >= cap) {
      truncated = true;
      break;
    }
    hits.push({ path: join(root, m[1]), rel: m[1], line: Number(m[2]), text: m[3] });
  }
  return { hits, truncated, files_scanned: hits.length };
}

export async function glob(pattern: string, root: string, maxResults: number | undefined): Promise<GlobResponse> {
  if (!pattern) throw new Error("empty pattern");
  const cap = clamp(maxResults ?? 500, 1, 2000);
  const rels = await listRels(root, false, undefined, pattern);
  const hits: GlobHit[] = [];
  let truncated = false;
  for (const rel of rels) {
    if (hits.length >= cap) {
      truncated = true;
      break;
    }
    hits.push({ path: join(root, rel), rel });
  }
  return { hits, truncated };
}

export async function search(
  root: string,
  query: string,
  limit: number | undefined,
  showHidden: boolean | undefined,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { hits: [], truncated: false };
  const cap = clamp(limit ?? 200, 1, 1000);
  const files = await listRels(root, showHidden ?? false);
  const truncated = files.length > MAX_SCANNED;

  const cands: SearchHit[] = [];
  const seenDirs = new Set<string>();
  for (const rel of files) {
    cands.push({ path: join(root, rel), rel, name: basename(rel), is_dir: false });
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirRel = parts.slice(0, i).join("/");
      if (seenDirs.has(dirRel)) continue;
      seenDirs.add(dirRel);
      cands.push({ path: join(root, dirRel), rel: dirRel, name: basename(dirRel), is_dir: true });
    }
  }
  return { hits: rankFuzzy(cands, q, cap), truncated };
}

export async function listFiles(
  root: string,
  limit: number | undefined,
  maxDepth: number | undefined,
  showHidden: boolean | undefined,
): Promise<ListFilesResult> {
  const cap = clamp(limit ?? 2000, 1, 10000);
  const depth = clamp(maxDepth ?? 8, 1, 16);
  let files = await listRels(root, showHidden ?? false, depth);
  let truncated = false;
  if (files.length > cap) {
    files = files.slice(0, cap);
    truncated = true;
  }
  files.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  return { files, truncated };
}

/** Relative file list under root (rg --files preferred, else find). */
async function listRels(root: string, showHidden: boolean, maxDepth?: number, glob?: string): Promise<string[]> {
  if (await hasRg()) {
    const args = ["--files", ...pruneRgArgs()];
    if (showHidden) args.push("--hidden");
    if (maxDepth != null) args.push("--max-depth", String(maxDepth));
    if (glob) args.push("-g", glob);
    const { stdout } = await run("rg", args, root);
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  }
  const args = [".", "-type", "f", ...(maxDepth != null ? ["-maxdepth", String(maxDepth)] : [])];
  // Prune the noisy dirs: find . ( -name node_modules -o … ) -prune -o -type f -print
  const findArgs = [".", ...pruneFindArgs(), ")", "-prune", "-o", "-type", "f", "-print"];
  const { stdout } = await run("find", maxDepth != null ? args : findArgs, root);
  return stdout
    .split("\n")
    .map((l) => l.trim().replace(/^\.\//, ""))
    .filter((l) => l && (showHidden || !l.split("/").some((seg) => seg.startsWith("."))));
}
