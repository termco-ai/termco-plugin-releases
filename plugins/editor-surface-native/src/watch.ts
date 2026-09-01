import type { WorkspaceEnv } from "@termco/workspace-base";
import { editorRuntime } from "./runtime";

export function watchAdd(paths: string[], workspace: WorkspaceEnv): void {
  if (paths.length) void editorRuntime().files.watchAdd(paths, workspace).catch(() => {});
}
export function watchRemove(paths: string[], workspace: WorkspaceEnv): void {
  if (paths.length) void editorRuntime().files.watchRemove(paths, workspace).catch(() => {});
}
export function listenFsChanged(handler: (paths: string[]) => void): Promise<() => void> {
  return Promise.resolve(editorRuntime().events.subscribe("fs:changed", (payload) => {
    const paths = (payload as { paths?: unknown })?.paths;
    if (Array.isArray(paths)) handler(paths.filter((path): path is string => typeof path === "string"));
  }));
}
export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (index <= 0) return path.slice(0, index + 1) || path;
  return path.slice(0, index);
}
