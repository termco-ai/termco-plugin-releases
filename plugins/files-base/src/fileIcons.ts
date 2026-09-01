/** A lifecycle-owned icon resolver. Returning `null` delegates to the next
 * resolver and ultimately to the registry's built-in generic icon. */
export interface FileIconResolver {
  id: string;
  priority?: number;
  fileIconUrl(name: string): string | null;
  folderIconUrl(name: string, expanded: boolean): string | null;
}

/** Consumer-facing presentation for workspace paths. */
export interface WorkspaceFileIconsCapability {
  fileIconUrl(name: string): string;
  folderIconUrl(name: string, expanded: boolean): string;
}

export interface UiFileIconsSnapshot {
  revision: number;
  resolverIds: readonly string[];
}

/** Stable UI-owned registry. Explorer and language plugins contribute richer
 * resolvers without owning the fallback capability used by every file UI. */
export interface UiFileIconsCapability extends WorkspaceFileIconsCapability {
  snapshot(): UiFileIconsSnapshot;
  subscribe(listener: () => void): () => void;
  registerResolver(resolver: FileIconResolver): () => void;
}
