/**
 * TextSource + git blob/worktree text reads
 * (gitShowText / readTextFile / decodeText).
 */
import { lstatSync, readFileSync } from "node:fs";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { GitError } from "./errors";
import { canonicalDir, DEFAULT_TIMEOUT_SECS, runGit } from "./runner";
import { filesCapability } from "./runtime";

export type TextSource =
  | { kind: "missing" }
  | { kind: "binary" }
  | { kind: "text"; text: string };

export function intoText(src: TextSource): string {
  return src.kind === "text" ? src.text : "";
}

/** null byte in first 8 KiB → binary; else lossy-UTF-8 text (matches decode_text). */
export function decodeText(bytes: Buffer): TextSource {
  const sniff = Math.min(bytes.length, 8192);
  if (bytes.subarray(0, sniff).includes(0)) return { kind: "binary" };
  return { kind: "text", text: bytes.toString("utf8") };
}

export async function gitShowText(
  workspace: WorkspaceEnv,
  repoRoot: string,
  spec: string,
): Promise<TextSource> {
  const output = await runGit(
    workspace,
    repoRoot,
    ["show", "--no-textconv", spec],
    DEFAULT_TIMEOUT_SECS,
  );
  if (output.timedOut) throw new GitError("timedOut", "git show timed out");
  if (output.exitCode !== 0) return { kind: "missing" };
  return decodeText(output.stdout);
}

/** What the remote workspace-files provider answers with. */
type RemoteRead =
  | { kind: "text"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge" }
  | { kind: "missing" };

/**
 * Read the working-tree copy of a file — from wherever the workspace actually
 * lives.
 *
 * This used to be local-only, which made every unstaged diff on an SSH rig look
 * like a full deletion: the OLD side came from `git show` (correctly routed to
 * the remote by `runGit`), the NEW side was read with `node:fs` on the Mac,
 * where `/home/user/…` does not exist. ENOENT became `missing`, `intoText` made
 * that an empty string, and the merge view faithfully rendered "everything was
 * deleted".
 */
export async function readTextFile(
  workspace: WorkspaceEnv,
  absPath: string,
): Promise<TextSource> {
  if (workspace?.kind === "ssh") {
    let res: RemoteRead;
    try {
      res = (await filesCapability().readFile(absPath, workspace, true)) as RemoteRead;
    } catch {
      // The remote throws for a missing path; anything else we cannot read is
      // equally "not available", and the caller now says so rather than
      // pretending the file is empty.
      return { kind: "missing" };
    }
    switch (res?.kind) {
      case "text":
        return { kind: "text", text: res.content };
      // `toolarge` shares this branch on purpose: the caller turns a binary
      // result into the patch fallback, which is the right view for a file too
      // big to diff anyway.
      case "binary":
      case "toolarge":
        return { kind: "binary" };
      default:
        return { kind: "missing" };
    }
  }

  // NOTE: the symlink rejection below is local-only — the remote `fs.readFile`
  // follows symlinks, like the rest of the app's fs path does. A real
  // difference, kept deliberately rather than silently.
  let meta;
  try {
    meta = lstatSync(absPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    throw e;
  }
  if (meta.isSymbolicLink()) {
    throw new GitError("commandFailed", `symlink rejected: ${absPath}`);
  }
  if (!meta.isFile()) return { kind: "missing" };
  return decodeText(readFileSync(canonicalDir(absPath)));
}
