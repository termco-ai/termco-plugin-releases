import type { WorkspaceEnv } from "@termco/workspace-base";

export interface WorkspaceDirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
}

export interface WorkspaceFileSearchHit {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
}

export interface WorkspaceFileSearchResult {
  hits: WorkspaceFileSearchHit[];
  truncated: boolean;
}

export interface WorkspaceFilesCapability {
  readFile(path: string, workspace: WorkspaceEnv, optional?: boolean): Promise<unknown>;
  writeFile(path: string, content: string, workspace: WorkspaceEnv, source?: string): Promise<void>;
  canonicalize(path: string, workspace: WorkspaceEnv): Promise<string>;
  stat(path: string, workspace: WorkspaceEnv, optional?: boolean): Promise<unknown>;
  readDir(path: string, showHidden: boolean, gitDecorations: boolean | undefined, workspace: WorkspaceEnv, optional?: boolean): Promise<WorkspaceDirEntry[]>;
  listSubdirs(path: string, showHidden: boolean, workspace: WorkspaceEnv): Promise<string[]>;
  createFile(path: string, workspace: WorkspaceEnv): Promise<void>;
  createDir(path: string, workspace: WorkspaceEnv): Promise<void>;
  rename(from: string, to: string, workspace: WorkspaceEnv): Promise<void>;
  delete(path: string, workspace: WorkspaceEnv): Promise<void>;
  copy(sources: string[], destination: string, workspace: WorkspaceEnv): Promise<void>;
  watchAdd(paths: string[], workspace: WorkspaceEnv): Promise<void>;
  watchRemove(paths: string[], workspace: WorkspaceEnv): Promise<void>;
  search(params: Record<string, unknown>, workspace: WorkspaceEnv): Promise<WorkspaceFileSearchResult>;
  listFiles(params: Record<string, unknown>, workspace: WorkspaceEnv): Promise<unknown>;
  grep(params: Record<string, unknown>, workspace: WorkspaceEnv): Promise<unknown>;
  grepInteractive(params: Record<string, unknown>, workspace: WorkspaceEnv): Promise<unknown>;
  glob(params: Record<string, unknown>, workspace: WorkspaceEnv): Promise<unknown>;
  readFileLocal(path: string, workspace?: WorkspaceEnv): unknown;
  readonly ripgrepPath: string;
}
