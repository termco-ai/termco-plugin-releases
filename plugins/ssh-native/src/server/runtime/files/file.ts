/**
 * File IO commands.
 * fs_read_file (text/binary/too-large classification), fs_write_file (atomic +
 * perm-preserving, emits fs:file-written), fs_canonicalize, fs_stat.
 */
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { resolvePath, toCanon } from "./runtime";

const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB
const BINARY_SNIFF_BYTES = 8 * 1024;

export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number }
  // Only produced for reads sent with `optional: true` (probes for files
  // that legitimately may not exist, e.g. TERMCO.md).
  | { kind: "missing" };

export type StatKind = "file" | "dir" | "symlink";
export interface FileStat {
  size: number;
  mtime: number;
  kind: StatKind;
}

/**
 * ENOENT arrives as a coded Error locally but only as a message string from
 * the ssh RPC (error objects don't survive the wire with their `code`).
 */
export function isMissingFileError(e: unknown): boolean {
  if (
    e &&
    typeof e === "object" &&
    (e as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    return true;
  }
  return e instanceof Error && e.message.includes("ENOENT");
}

export function fsReadFile(path: string, workspace?: WorkspaceEnv): ReadResult {
  const p = resolvePath(path, workspace);
  const meta = statSync(p); // follows symlinks; throws on missing
  const size = meta.size;
  if (size > MAX_READ_BYTES) {
    return { kind: "toolarge", size, limit: MAX_READ_BYTES };
  }
  const bytes = readFileSync(p);
  const sniffLen = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  if (bytes.subarray(0, sniffLen).includes(0)) {
    return { kind: "binary", size };
  }
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { kind: "text", content, size };
  } catch {
    return { kind: "binary", size };
  }
}

/** Atomic write via a random-named tempfile in the target's parent + rename. */
function writeAtomic(target: string, content: Buffer): void {
  const parent = dirname(target);
  const tmp = join(parent, `.${randomBytes(8).toString("hex")}.termco.tmp`);
  try {
    writeFileSync(tmp, content, { flag: "wx" });
    renameSync(tmp, target);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      // best effort
    }
    throw e;
  }
}

export function writeFilePreservingPerms(target: string, content: Buffer): void {
  let mode: number | undefined;
  try {
    mode = statSync(target).mode;
  } catch {
    // new file
  }
  writeAtomic(target, content);
  if (mode !== undefined) {
    try {
      chmodSync(target, mode);
    } catch {
      // non-fatal
    }
  }
}

export function fsWriteFile(
  path: string,
  content: string,
  workspace: WorkspaceEnv,
  source: string | undefined,
  emit: (event: string, payload: unknown) => void,
): void {
  const target = resolvePath(path, workspace);
  writeFilePreservingPerms(target, Buffer.from(content, "utf8"));
  const payload: { path: string; source?: string } = { path };
  if (source != null) payload.source = source;
  emit("fs:file-written", payload);
}

export function fsCanonicalize(path: string, workspace?: WorkspaceEnv): string {
  const p = resolvePath(path, workspace);
  return toCanon(realpathSync(p)); // throws on missing
}

export function fsStat(path: string, workspace?: WorkspaceEnv): FileStat {
  const p = resolvePath(path, workspace);
  let isSymlink = false;
  try {
    isSymlink = lstatSync(p).isSymbolicLink();
  } catch {
    isSymlink = false;
  }
  const meta = statSync(p); // follows symlink; throws on broken link
  const kind: StatKind = isSymlink
    ? "symlink"
    : meta.isDirectory()
      ? "dir"
      : "file";
  const mtime = Number.isFinite(meta.mtimeMs) ? Math.floor(meta.mtimeMs) : 0;
  return { size: meta.size, mtime, kind };
}
