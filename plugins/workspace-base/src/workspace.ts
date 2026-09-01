export type WorkspaceEnv =
  | { kind: "local" }
  | { kind: "wsl"; distro: string }
  | {
      kind: "ssh";
      connectionId: string;
      host: string;
      user?: string;
      port?: number;
    }
  | null
  | undefined;

export interface WslDistro {
  name: string;
  default: boolean;
  running: boolean;
}

export interface WorkspaceCapability {
  authorize(path: string, workspace: WorkspaceEnv): string;
  authorizeRoot(path: string): string;
  isAuthorized(path: string): boolean;
  canonicalize(path: string): string;
  currentDir(): string;
  homeDir(): string;
  resolvePath(path: string, workspace: WorkspaceEnv): string;
  normalize(workspace: WorkspaceEnv): {
    kind: "local" | "wsl" | "ssh";
    distro?: string;
    connectionId?: string;
  };
  toCanonicalDisplay(path: string): string;
  stripWindowsVerbatim(path: string): string;
  listWslDistros(): WslDistro[];
  defaultWslDistro(): string | null;
  wslHome(distro: string): string;
  wslPathToHost(distro: string, path: string): string;
}
