export * from "./desktop";

export const DESKTOP_INTEGRATION_SERVICE = "desktop.integration" as const;
export const DESKTOP_WINDOW_CONTROL_SERVICE = "desktop.window-control" as const;
export const DESKTOP_WINDOW_SERVICE = "desktop.window" as const;

declare module "@termco/kernel" {
  interface Services {
    [DESKTOP_INTEGRATION_SERVICE]: import("./desktop").DesktopIntegrationCapability;
    [DESKTOP_WINDOW_CONTROL_SERVICE]: import("./desktop").DesktopWindowControlCapability;
    [DESKTOP_WINDOW_SERVICE]: import("./desktop").DesktopWindowCapability;
  }
}
