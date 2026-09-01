type PluginPermission =
  | "ui.render"
  | "ui.global-styles"
  | "process.main"
  | "process.utility"
  | "process.spawn"
  | "network"
  | "filesystem.read"
  | "filesystem.write"
  | "secrets"
  | "profile.read"
  | "profile.mutate";

export interface CapabilityCatalogItem {
  id: string;
  version: string;
  description: string;
  cardinality: "exclusive" | "multi";
  providers: string[];
  optional?: boolean;
  key?: string;
}

export type PluginCatalogStatus =
  | "active"
  | "active-reduced"
  | "blocked"
  | "failed"
  | "disabled";

export interface PluginRuntimeCatalogState {
  process: string;
  state: "inactive" | "pending" | "activating" | "active" | "unloading" | "failed";
  missingServices: string[];
  features: Array<{
    id: string;
    label: string;
    state: "pending" | "activating" | "active" | "unloading" | "failed";
    missingServices: string[];
  }>;
}

export interface PluginCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  sourceFolder: string;
  sourceType: "bundled" | "local" | "package";
  editable: boolean;
  /** True only for mutable local source inside Termco's managed user-plugin
   * root. These entries may be safely uninstalled and moved to Trash. */
  userInstalled: boolean;
  selectedBy: string;
  whyLoaded: string;
  replaces?: string;
  provides: CapabilityCatalogItem[];
  consumes: CapabilityCatalogItem[];
  permissions: PluginPermission[];
  processes: string[];
  /** Truthful live state, distinct from selection in the profile. */
  status?: PluginCatalogStatus;
  runtime?: PluginRuntimeCatalogState[];
}
