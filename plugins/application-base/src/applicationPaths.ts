export interface ApplicationPaths {
  appConfigDir: string;
  pathSeparator: string;
}

/** Replaceable provider for operating-system application paths. Consumers
 * never read preload globals or assume a platform-specific separator. */
export interface ApplicationPathsCapability {
  getPaths(): Promise<ApplicationPaths>;
}
