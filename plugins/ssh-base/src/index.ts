export * from "./ssh";

export const SSH_CLIENT_SERVICE = "ssh.client" as const;

declare module "@termco/kernel" {
  interface Services {
    [SSH_CLIENT_SERVICE]: import("./ssh").SshClientCapability;
  }
}
