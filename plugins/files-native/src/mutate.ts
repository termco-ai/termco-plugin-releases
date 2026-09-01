/**
 * Filesystem mutations.
 * create_file / create_dir / rename / delete / copy. Every op refuses to
 * clobber an existing target (the data-loss guard).
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { resolvePath } from "./runtime";

export function fsCreateFile(path: string, workspace?: WorkspaceEnv): void {
  const p = resolvePath(path, workspace);
  if (existsSync(p)) throw new Error(`already exists: ${p}`);
  writeFileSync(p, ""); // throws if parent missing (parity)
}

export function fsCreateDir(path: string, workspace?: WorkspaceEnv): void {
  const p = resolvePath(path, workspace);
  if (existsSync(p)) throw new Error(`already exists: ${p}`);
  mkdirSync(p, { recursive: true });
}

export function fsRename(from: string, to: string, workspace?: WorkspaceEnv): void {
  const fromP = resolvePath(from, workspace);
  const toP = resolvePath(to, workspace);
  if (!existsSync(fromP)) throw new Error(`not found: ${fromP}`);
  if (existsSync(toP)) throw new Error(`already exists: ${toP}`);
  renameSync(fromP, toP);
}

export function fsDelete(path: string, workspace?: WorkspaceEnv): void {
  const p = resolvePath(path, workspace);
  const meta = lstatSync(p); // throws on missing; never follows the link
  if (meta.isDirectory()) {
    rmSync(p, { recursive: true, force: false });
  } else {
    rmSync(p, { force: false }); // unlink — removes a symlink itself
  }
}

function copyRecursive(src: string, dst: string): void {
  const st = lstatSync(src);
  if (st.isDirectory()) {
    mkdirSync(dst); // throws if dst exists (parity with create_dir)
    for (const name of readdirSync(src)) {
      copyRecursive(join(src, name), join(dst, name));
    }
  } else {
    copyFileSync(src, dst);
  }
}

export function fsCopy(
  sources: string[],
  destDir: string,
  workspace?: WorkspaceEnv,
): void {
  const dest = resolvePath(destDir, workspace);
  for (const source of sources) {
    const name = basename(source.replace(/[/\\]+$/, ""));
    if (!name) throw new Error(`invalid source: ${source}`);
    const target = join(dest, name);
    if (existsSync(target)) throw new Error(`already exists: ${target}`);
    copyRecursive(source, target);
  }
}
