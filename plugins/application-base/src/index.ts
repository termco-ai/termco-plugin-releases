export * from "./applicationInfo";
export * from "./applicationPaths";
export * from "./bootDiagnostics";
export * from "./updater";

export const APPLICATION_UPDATES_SERVICE = "application.updates" as const;
export const APPLICATION_UPDATE_STATE_SERVICE = "application.update-state" as const;
export const APPLICATION_INFO_SERVICE = "application.info" as const;
export const APPLICATION_BOOT_DIAGNOSTICS_SERVICE = "application.boot-diagnostics" as const;
export const APPLICATION_BRANDING_SERVICE = "application.branding" as const;
export const APPLICATION_PATHS_SERVICE = "application.paths" as const;

declare module "@termco/kernel" {
  interface Services {
    [APPLICATION_UPDATES_SERVICE]: import("./updater").ApplicationUpdatesCapability;
    [APPLICATION_UPDATE_STATE_SERVICE]: import("./updater").ApplicationUpdateStateCapability;
    [APPLICATION_INFO_SERVICE]: import("./applicationInfo").ApplicationInfoCapability;
    [APPLICATION_BOOT_DIAGNOSTICS_SERVICE]: import("./bootDiagnostics").BootDiagnosticsCapability;
    [APPLICATION_BRANDING_SERVICE]: import("./applicationInfo").ApplicationBrandingCapability;
    [APPLICATION_PATHS_SERVICE]: import("./applicationPaths").ApplicationPathsCapability;
  }
}
