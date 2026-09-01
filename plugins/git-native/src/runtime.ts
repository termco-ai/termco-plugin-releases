import type { WorkspaceFilesCapability } from "@termco/files-base";
import type {
  WorkspaceCapability,
  WorkspaceEnv,
  WorkspaceExecutionCapability,
} from "@termco/workspace-base";

let workspace: WorkspaceCapability | null = null;
let execution: WorkspaceExecutionCapability | null = null;
let files: WorkspaceFilesCapability | null = null;

export function gitRuntimeActive(): boolean {
  return workspace !== null && execution !== null && files !== null;
}

export function configureGitRuntime(input: {
  workspace: WorkspaceCapability;
  execution: WorkspaceExecutionCapability;
  files: WorkspaceFilesCapability;
}): () => void {
  workspace = input.workspace;
  execution = input.execution;
  files = input.files;
  return () => {
    if (workspace === input.workspace) workspace = null;
    if (execution === input.execution) execution = null;
    if (files === input.files) files = null;
  };
}

function selectedWorkspace(): WorkspaceCapability {
  if (!workspace) throw new Error("git.repository workspace capability is not configured");
  return workspace;
}

export function authorize(path: string, environment: WorkspaceEnv): string {
  return selectedWorkspace().authorize(path, environment);
}

export function executionCapability(): WorkspaceExecutionCapability {
  if (!execution) throw new Error("git.repository workspace execution is not configured");
  return execution;
}

export function filesCapability(): WorkspaceFilesCapability {
  if (!files) throw new Error("git.repository files capability is not configured");
  return files;
}
