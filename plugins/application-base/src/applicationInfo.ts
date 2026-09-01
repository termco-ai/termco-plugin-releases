export interface ApplicationInfo {
  name: string;
  version: string;
  bundleId: string;
  platform: NodeJS.Platform;
  architecture: string;
}

/** Replaceable provider for application identity/build facts used by About,
 * diagnostics, support bundles, and company distributions. */
export interface ApplicationInfoCapability {
  getInfo(): Promise<ApplicationInfo>;
}

/** Application-wide product identity used by replaceable shell and About UI.
 * The provider owns the asset so consumers never reach into another plugin's
 * source folder. */
export interface ApplicationBrandingCapability {
  logoUrl: string;
}
