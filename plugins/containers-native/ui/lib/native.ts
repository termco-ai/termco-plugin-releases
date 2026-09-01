import type { ContainersCapability } from "@termco/containers-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type {
  ContainerActionKind,
  ContainerRuntime,
  ContainerStats,
  ContainersListResult,
  LogSearchResult,
} from "../types";

let capability: ContainersCapability | null = null;
let workspace: WorkspaceEnv = { kind: "local" };

export function containersNativeActive(): boolean {
  return capability !== null;
}

export function configureContainersNative(next: ContainersCapability | null): void {
  capability = next;
}

export function setContainersWorkspace(next: WorkspaceEnv): void {
  workspace = next ?? { kind: "local" };
}

export function containersWorkspace(): WorkspaceEnv {
  return workspace;
}

function provider(): ContainersCapability {
  if (!capability) throw new Error("containers.runtime is not configured");
  return capability;
}

export const containersNative = {
  list: (): Promise<ContainersListResult> => provider().list(workspace),
  action: (runtime: ContainerRuntime, id: string, action: ContainerActionKind) =>
    provider().action(runtime, id, action, workspace),
  logs: (runtime: ContainerRuntime, id: string, tail?: number) =>
    provider().logs(runtime, id, tail, workspace),
  logsSearch: (
    runtime: ContainerRuntime,
    id: string,
    query: string,
    options: {
      maxMatches?: number;
      regex?: boolean;
      context?: number;
      caseSensitive?: boolean;
    } = {},
  ): Promise<LogSearchResult> =>
    provider().logsSearch(runtime, id, query, options, workspace),
  inspect: (runtime: ContainerRuntime, id: string) =>
    provider().inspect(runtime, id, workspace),
  stats: (runtime: ContainerRuntime, id: string): Promise<ContainerStats[]> =>
    provider().stats(runtime, id, workspace),
  imageInspect: (runtime: ContainerRuntime, image: string) =>
    provider().imageInspect(runtime, image, workspace),
};
