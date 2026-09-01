export * from "./git";
export * from "./sourceControl";

export const GIT_REPOSITORY_SERVICE = "git.repository" as const;
export const SOURCE_CONTROL_NAVIGATION_SERVICE = "source-control.navigation" as const;

declare module "@termco/kernel" {
  interface Services {
    [GIT_REPOSITORY_SERVICE]: import("./git").GitCapability;
    [SOURCE_CONTROL_NAVIGATION_SERVICE]: import("./sourceControl").SourceControlNavigationCapability;
  }
}
