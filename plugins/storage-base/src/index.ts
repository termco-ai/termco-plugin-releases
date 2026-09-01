export * from "./preferences";
export * from "./secrets";
export * from "./storage";

export const STORAGE_APPLICATION_SERVICE = "storage.application" as const;
export const SETTINGS_PREFERENCES_SERVICE = "settings.preferences" as const;
export const SECRETS_APPLICATION_SERVICE = "secrets.application" as const;

declare module "@termco/kernel" {
  interface Services {
    [STORAGE_APPLICATION_SERVICE]: import("./storage").StorageCapability;
    [SETTINGS_PREFERENCES_SERVICE]: import("./preferences").PreferencesCapability;
    [SECRETS_APPLICATION_SERVICE]: import("./secrets").SecretsCapability;
  }
}
