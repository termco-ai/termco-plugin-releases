export * from "./shortcuts";

export const SHORTCUTS_REGISTRY_SERVICE = "shortcuts.registry" as const;

declare module "@termco/kernel" {
  interface Services {
    [SHORTCUTS_REGISTRY_SERVICE]: import("./shortcuts").ShortcutRegistryCapability;
  }
}
