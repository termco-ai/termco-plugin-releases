import type { WorkspaceEnv, WslDistro } from "./workspace";

export type SelectedWorkspaceEnvironment = Exclude<
  WorkspaceEnv,
  null | undefined
>;

export interface WorkspaceEnvironmentSnapshot {
  workspace: SelectedWorkspaceEnvironment;
  home: string | null;
  launchCwd: string | null;
  launchCwdResolved: boolean;
  wslDistros: readonly WslDistro[];
  wslLoading: boolean;
  wslError: string | null;
}

/** Shared renderer workspace selection. The selected provider resolves homes,
 * authorizes roots, rejects dirty workspace switches, resets terminal state,
 * and guards asynchronous rig adoption against stale results. */
export interface WorkspaceEnvironmentCapability {
  snapshot(): WorkspaceEnvironmentSnapshot;
  subscribe(listener: () => void): () => void;
  switch(workspace: SelectedWorkspaceEnvironment): Promise<boolean>;
  adopt(workspace: SelectedWorkspaceEnvironment): Promise<string | null>;
  refreshWslDistros(): Promise<readonly WslDistro[]>;
}
