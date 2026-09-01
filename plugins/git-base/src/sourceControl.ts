export interface SourceControlGraphRequest {
  repoRoot: string;
  branch?: string | null;
}

/** Feature-owned Source Control navigation used by the header and commands.
 * The selected plugin resolves the active repository and owns Git-tab reuse. */
export interface SourceControlNavigationCapability {
  openGraph(request?: SourceControlGraphRequest): Promise<void>;
}
