import type { WorkspaceEnv } from "@termco/workspace-base";

export type ContainerRuntime = "docker" | "podman" | "apple";
export type ContainerAction = "start" | "stop" | "restart";

export interface ContainerSummary {
  id: string;
  runtime: ContainerRuntime;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpuPerc: number;
  memUsage: string;
  memPerc: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface ContainerLogMatch {
  line: number;
  text: string;
  before?: string[];
  after?: string[];
}

export interface ContainerLogSearchResult {
  matches: ContainerLogMatch[];
  scanned: number;
  matched: number;
  truncated: boolean;
}

export interface ContainerLogSearchOptions {
  maxMatches?: number;
  regex?: boolean;
  context?: number;
  caseSensitive?: boolean;
}

export interface ContainerRuntimeAvailability {
  docker: boolean;
  podman: boolean;
  apple: boolean;
}

export interface ContainersListResult {
  containers: ContainerSummary[];
  availability: ContainerRuntimeAvailability;
}

/** One application-wide container runtime. Renderer and AI consumers share
 * the same local/SSH routing and never invoke private command names. */
export interface ContainersCapability {
  list(workspace: WorkspaceEnv): Promise<ContainersListResult>;
  action(runtime: ContainerRuntime, id: string, action: ContainerAction, workspace: WorkspaceEnv): Promise<void>;
  logs(runtime: ContainerRuntime, id: string, tail: number | undefined, workspace: WorkspaceEnv): Promise<string>;
  logsSearch(runtime: ContainerRuntime, id: string, query: string, options: ContainerLogSearchOptions, workspace: WorkspaceEnv): Promise<ContainerLogSearchResult>;
  inspect(runtime: ContainerRuntime, id: string, workspace: WorkspaceEnv): Promise<string>;
  stats(runtime: ContainerRuntime, id: string, workspace: WorkspaceEnv): Promise<ContainerStats[]>;
  imageInspect(runtime: ContainerRuntime, image: string, workspace: WorkspaceEnv): Promise<string>;
}
