export * from "./http";

export const NETWORK_HTTP_SERVICE = "network.http" as const;

declare module "@termco/kernel" {
  interface Services {
    [NETWORK_HTTP_SERVICE]: import("./http").HttpCapability;
  }
}
