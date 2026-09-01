import type { WorkspaceEnv } from "@termco/workspace-base";
import { explorerRuntime } from "../../runtime";

const FS_CHANGED_EVENT = "fs:changed";

type FsChangedPayload = { paths: string[] };

// `env` is the env that owns these paths (the active space's), passed by the
// caller — NOT the global env at call-time. Registering/removing a watch against
// the wrong backend silently no-ops, leaking the real watcher (which then keeps
// firing fs:changed for a path the wrong backend can't serve).
export function watchAdd(paths: string[], env: WorkspaceEnv): void {
  if (paths.length === 0) return;
  void explorerRuntime().files.watchAdd(paths, env).catch(() => {});
}

export function watchRemove(paths: string[], env: WorkspaceEnv): void {
  if (paths.length === 0) return;
  void explorerRuntime().files.watchRemove(paths, env).catch(() => {});
}

export async function listenFsChanged(
  handler: (paths: string[]) => void,
): Promise<() => void> {
  return explorerRuntime().events.subscribe(FS_CHANGED_EVENT, (payload) => {
    const event = payload as Partial<FsChangedPayload> | null;
    if (Array.isArray(event?.paths)) handler(event.paths);
  });
}

export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) return path.slice(0, i + 1) || path;
  return path.slice(0, i);
}
