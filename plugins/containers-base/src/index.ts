export * from "./containers";

export const CONTAINERS_RUNTIME_SERVICE = "containers.runtime" as const;

declare module "@termco/kernel" {
  interface Services {
    [CONTAINERS_RUNTIME_SERVICE]: import("./containers").ContainersCapability;
  }
}
