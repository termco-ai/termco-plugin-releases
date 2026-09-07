import type { ForgeReviewFile, ForgeReviewFileStatus } from "@termco/forge-reviews-base";

function decodeQuotedPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed;
  // Git quotes bytes using C escapes, including octal UTF-8 sequences.
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  const body = trimmed.slice(1, -1);
  for (let i = 0; i < body.length;) {
    if (body[i] === "\\") {
      const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1));
      if (octal) { bytes.push(parseInt(octal[0], 8)); i += octal[0].length + 1; continue; }
      const escaped = escapes[body[i + 1]];
      if (escaped !== undefined) { bytes.push(escaped); i += 2; continue; }
    }
    const character = String.fromCodePoint(body.codePointAt(i)!);
    bytes.push(...encoder.encode(character));
    i += character.length;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function headerPath(line: string, prefix: "--- " | "+++ "): string | null {
  if (!line.startsWith(prefix)) return null;
  const raw = decodeQuotedPath(line.slice(prefix.length).split("\t", 1)[0] ?? "");
  if (!raw || raw === "/dev/null") return null;
  return raw.replace(/^[ab]\//, "");
}

function pathFromDiffHeader(line: string): string | null {
  const match = /^diff --git ("(?:\\.|[^"\\])*"|\S+) ("(?:\\.|[^"\\])*"|\S+)$/.exec(line);
  return match ? decodeQuotedPath(match[2]).replace(/^[ab]\//, "") : null;
}

function statusFor(input: {
  oldPath: string | null;
  newPath: string | null;
  renamedFrom: string | null;
  renamedTo: string | null;
  binary: boolean;
}): ForgeReviewFileStatus {
  if (input.binary) return "binary";
  if (
    input.renamedFrom ||
    input.renamedTo ||
    (input.oldPath && input.newPath && input.oldPath !== input.newPath)
  )
    return "renamed";
  if (!input.oldPath) return "added";
  if (!input.newPath) return "deleted";
  return "modified";
}

function parseFile(lines: string[]): ForgeReviewFile | null {
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let renamedFrom: string | null = null;
  let renamedTo: string | null = null;
  let additions = 0;
  let deletions = 0;
  let binary = false;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@ ")) inHunk = true;
    if (inHunk) {
      if (line.startsWith("+")) additions += 1;
      if (line.startsWith("-")) deletions += 1;
      continue;
    }
    oldPath ??= headerPath(line, "--- ");
    newPath ??= headerPath(line, "+++ ");
    if (line.startsWith("rename from ")) renamedFrom = decodeQuotedPath(line.slice(12));
    if (line.startsWith("rename to ")) renamedTo = decodeQuotedPath(line.slice(10));
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) binary = true;
  }
  const fallback = pathFromDiffHeader(lines[0] ?? "");
  const path = renamedTo ?? newPath ?? renamedFrom ?? oldPath ?? fallback;
  if (!path) return null;
  const previousPath = renamedFrom ?? (oldPath && oldPath !== path ? oldPath : null);
  return {
    path,
    previousPath,
    status: statusFor({ oldPath, newPath, renamedFrom, renamedTo, binary }),
    additions,
    deletions,
    patch: lines.join("\n"),
  };
}

/** Parse the provider-neutral `diff --git` format emitted by gh, glab, and
 * Gitea's authenticated diff endpoint. One file stays one render unit so the
 * review tab never mounts an entire large review into the DOM. */
export function parseUnifiedDiff(diff: string): ForgeReviewFile[] {
  const files: ForgeReviewFile[] = [];
  let current: string[] = [];
  for (const line of diff.replaceAll("\r\n", "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        const parsed = parseFile(current);
        if (parsed) files.push(parsed);
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const parsed = parseFile(current);
    if (parsed) files.push(parsed);
  }
  return files;
}
