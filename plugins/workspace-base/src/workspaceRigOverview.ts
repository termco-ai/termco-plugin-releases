export interface WorkspaceRigOverviewSnapshot {
  revision: number;
  open: boolean;
}

/** Visibility seam for the complete rig-management interface. The selected
 * UI provider owns the state; commands and shortcuts request visibility. */
export interface WorkspaceRigOverviewCapability {
  snapshot(): WorkspaceRigOverviewSnapshot;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean): void;
}
