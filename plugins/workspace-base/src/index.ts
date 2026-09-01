export * from "./workspace";
export * from "./workspaceEnvironment";
export * from "./workspaceExecution";
export * from "./workspacePresentation";
export * from "./workspaceRigOverview";
export * from "./workspaceRigWorkflows";
export * from "./workspaceRigs";
export * from "./workspaceTabActions";
export * from "./workspaceTabs";

export const WORKSPACE_REGISTRY_SERVICE = "workspace.registry" as const;
export const WORKSPACE_ENVIRONMENT_SERVICE = "workspace.environment" as const;
export const WORKSPACE_EXECUTION_SERVICE = "workspace.execution" as const;
export const WORKSPACE_EXECUTION_BACKENDS_SERVICE = "workspace.execution.backends" as const;
export const WORKSPACE_RIGS_SERVICE = "workspace.rigs" as const;
export const WORKSPACE_RIGS_OVERVIEW_SERVICE = "workspace.rigs-overview" as const;
export const WORKSPACE_PRESENTATION_SERVICE = "workspace.presentation" as const;
export const WORKSPACE_PRESENTATION_CONTROL_SERVICE = "workspace.presentation-control" as const;
export const WORKSPACE_RIG_WORKFLOWS_SERVICE = "workspace.rig-workflows" as const;
export const WORKSPACE_TABS_SERVICE = "workspace.tabs" as const;
export const WORKSPACE_TAB_ACTIONS_SERVICE = "workspace.tab-actions" as const;
export const WORKSPACE_TAB_CLOSE_GUARDS_SERVICE = "workspace.tab-close-guards" as const;

declare module "@termco/kernel" {
  interface Services {
    [WORKSPACE_REGISTRY_SERVICE]: import("./workspace").WorkspaceCapability;
    [WORKSPACE_ENVIRONMENT_SERVICE]: import("./workspaceEnvironment").WorkspaceEnvironmentCapability;
    [WORKSPACE_EXECUTION_SERVICE]: import("./workspaceExecution").WorkspaceExecutionCapability;
    [WORKSPACE_EXECUTION_BACKENDS_SERVICE]: import("./workspaceExecution").WorkspaceExecutionBackendRegistry;
    [WORKSPACE_RIGS_SERVICE]: import("./workspaceRigs").WorkspaceRigsCapability;
    [WORKSPACE_RIGS_OVERVIEW_SERVICE]: import("./workspaceRigOverview").WorkspaceRigOverviewCapability;
    [WORKSPACE_PRESENTATION_SERVICE]: import("./workspacePresentation").WorkspacePresentationCapability;
    [WORKSPACE_PRESENTATION_CONTROL_SERVICE]: import("./workspacePresentation").WorkspacePresentationControlCapability;
    [WORKSPACE_RIG_WORKFLOWS_SERVICE]: import("./workspaceRigWorkflows").WorkspaceRigWorkflowsCapability;
    [WORKSPACE_TABS_SERVICE]: import("./workspaceTabs").WorkspaceTabsCapability;
    [WORKSPACE_TAB_ACTIONS_SERVICE]: import("./workspaceTabActions").WorkspaceTabActionsCapability;
    [WORKSPACE_TAB_CLOSE_GUARDS_SERVICE]: import("./workspaceTabActions").WorkspaceTabCloseGuardRegistry;
  }
}
