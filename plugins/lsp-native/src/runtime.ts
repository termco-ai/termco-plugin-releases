import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceExecutionCapability } from "@termco/workspace-base";

export interface LspRuntimeDependencies {
  events: ApplicationEventsCapability;
  execution: WorkspaceExecutionCapability;
  files: WorkspaceFilesCapability;
}

let dependencies: LspRuntimeDependencies | null = null;

export function configureLspRuntime(value: LspRuntimeDependencies | null): void {
  dependencies = value;
}

export function lspRuntime(): LspRuntimeDependencies {
  if (!dependencies) throw new Error("lsp-native is not active");
  return dependencies;
}
