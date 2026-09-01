import type { WorkspaceFileIconsCapability } from "@termco/files-base";

let icons: WorkspaceFileIconsCapability | null = null;

export function aiFileIconsActive(): boolean {
  return icons !== null;
}

export function configureFileIcons(
  capability: WorkspaceFileIconsCapability,
): () => void {
  icons = capability;
  return () => {
    if (icons === capability) icons = null;
  };
}

export function fileIconUrl(name: string): string {
  return icons?.fileIconUrl(name) ?? "";
}
