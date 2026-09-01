export * from "./workflows";

export const WORKFLOWS_LIBRARY_SERVICE = "workflows.library" as const;
export const WORKFLOWS_DEFINITIONS_SERVICE = "workflows.definitions" as const;
export const WORKFLOWS_RUNNERS_SERVICE = "workflows.runners" as const;
export const WORKFLOWS_PARAMETER_SOURCES_SERVICE =
  "workflows.parameter-sources" as const;

declare module "@termco/kernel" {
  interface Services {
    [WORKFLOWS_LIBRARY_SERVICE]: import("./workflows").WorkflowsLibraryCapability;
    [WORKFLOWS_DEFINITIONS_SERVICE]: import("./workflows").WorkflowDefinitionsRegistry;
    [WORKFLOWS_RUNNERS_SERVICE]: import("./workflows").WorkflowRunnerRegistry;
    [WORKFLOWS_PARAMETER_SOURCES_SERVICE]: import("./workflows").WorkflowParameterSourceRegistry;
  }
}
