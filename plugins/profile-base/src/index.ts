export * from "./catalog";
export * from "./profileApi";

export const PROFILE_CATALOG_SERVICE = "profile.catalog" as const;
export const PROFILE_TRANSACTIONS_SERVICE = "profile.transactions" as const;
export const PLUGIN_CATALOG_SERVICE = "plugin.catalog" as const;

declare module "@termco/kernel" {
  interface Services {
    [PROFILE_CATALOG_SERVICE]: import("./profileApi").PluginProfileApi;
    [PROFILE_TRANSACTIONS_SERVICE]: import("./profileApi").PluginProfileApi;
    [PLUGIN_CATALOG_SERVICE]: readonly import("./catalog").PluginCatalogItem[];
  }
}
