/**
 * `git status --porcelain=v2 -z` parser.
 */
export interface GitChangedFile {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
}

export interface PorcelainV2 {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  files: GitChangedFile[];
}

function skipFields(s: string, n: number): string | null {
  let rest = s;
  for (let i = 0; i < n; i++) {
    const idx = rest.indexOf(" ");
    if (idx < 0) return null;
    rest = rest.slice(idx + 1);
  }
  return rest;
}

function xyChars(xy: string): [string, string] {
  const toSpace = (c: string) => (c === "." ? " " : c);
  return [toSpace(xy[0] ?? " "), toSpace(xy[1] ?? " ")];
}

function isStaged(i: string, w: string): boolean {
  return i !== " " && !(i === "?" && w === "?");
}

function isUnstaged(i: string, w: string): boolean {
  const untracked = i === "?" && w === "?";
  return w !== " " || untracked;
}

function statusLabel(i: string, w: string): string {
  if (i === "?" && w === "?") return "Untracked";
  if (i === "A") return "Added";
  if (i === "M" || w === "M") return "Modified";
  if (i === "D" || w === "D") return "Deleted";
  if (i === "R" || w === "R") return "Renamed";
  if (i === "C" || w === "C") return "Copied";
  if (i === "U" || w === "U") return "Unmerged";
  return "Changed";
}

function makeFile(
  indexStatus: string,
  worktreeStatus: string,
  path: string,
  originalPath: string | null,
): GitChangedFile {
  return {
    path,
    originalPath,
    indexStatus,
    worktreeStatus,
    staged: isStaged(indexStatus, worktreeStatus),
    unstaged: isUnstaged(indexStatus, worktreeStatus),
    untracked: indexStatus === "?" && worktreeStatus === "?",
    statusLabel: statusLabel(indexStatus, worktreeStatus),
  };
}

function parseOrdinary(rest: string): GitChangedFile | null {
  if (rest.length < 2) return null;
  const path = skipFields(rest, 7);
  if (path == null) return null;
  const [i, w] = xyChars(rest.slice(0, 2));
  return makeFile(i, w, path, null);
}

function parseRenamed(rest: string, origPath: string): GitChangedFile | null {
  if (rest.length < 2) return null;
  const after = skipFields(rest, 8);
  if (after == null) return null;
  const [i, w] = xyChars(rest.slice(0, 2));
  return makeFile(i, w, after, origPath);
}

function parseUnmerged(rest: string): GitChangedFile | null {
  if (rest.length < 2) return null;
  const path = skipFields(rest, 9);
  if (path == null) return null;
  const [i, w] = xyChars(rest.slice(0, 2));
  return makeFile(i, w, path, null);
}

export function parsePorcelainV2(stdout: string): PorcelainV2 {
  const out: PorcelainV2 = {
    branch: "HEAD",
    upstream: null,
    ahead: 0,
    behind: 0,
    isDetached: false,
    files: [],
  };
  const tokens = stdout.split("\0").filter((t) => t.length > 0);
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx++];
    if (tok.startsWith("# branch.head ")) {
      const rest = tok.slice("# branch.head ".length);
      out.branch = rest;
      out.isDetached = rest === "(detached)";
      continue;
    }
    if (tok.startsWith("# branch.upstream ")) {
      out.upstream = tok.slice("# branch.upstream ".length);
      continue;
    }
    if (tok.startsWith("# branch.ab ")) {
      const parts = tok.slice("# branch.ab ".length).trim().split(/\s+/);
      if (parts[0]) out.ahead = Number.parseInt(parts[0].replace(/^\+/, ""), 10) || 0;
      if (parts[1]) out.behind = Number.parseInt(parts[1].replace(/^-/, ""), 10) || 0;
      continue;
    }
    if (tok.startsWith("# ")) continue;
    if (tok.startsWith("1 ")) {
      const f = parseOrdinary(tok.slice(2));
      if (f) out.files.push(f);
      continue;
    }
    if (tok.startsWith("2 ")) {
      const orig = tokens[idx++] ?? "";
      const f = parseRenamed(tok.slice(2), orig);
      if (f) out.files.push(f);
      continue;
    }
    if (tok.startsWith("u ")) {
      const f = parseUnmerged(tok.slice(2));
      if (f) out.files.push(f);
      continue;
    }
    if (tok.startsWith("? ")) {
      out.files.push(makeFile("?", "?", tok.slice(2), null));
      continue;
    }
  }
  return out;
}
