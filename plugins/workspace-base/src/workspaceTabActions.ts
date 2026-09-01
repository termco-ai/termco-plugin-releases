import type { Dispose } from "@termco/kernel";
import type { WorkspaceTabRecord } from "./workspaceTabs";

export type WorkspaceTabBulkCloseMode = "others" | "right" | "left" | "all";

export interface WorkspaceTabClosePrompt {
  title: string;
  body: string;
  confirmLabel?: string;
}

export type WorkspaceTabCloseVerdict =
  | "close"
  | "cancel"
  | { prompt: WorkspaceTabClosePrompt };

/** Kind-owned close policy. The workflow provider composes all contributed
 * guards without importing the editor, terminal, or any other surface. */
export interface WorkspaceTabCloseGuardContribution {
  readonly id: string;
  readonly kinds: readonly string[];
  canClose(
    tab: WorkspaceTabRecord,
  ): WorkspaceTabCloseVerdict | Promise<WorkspaceTabCloseVerdict>;
}

export interface WorkspaceTabCloseGuardRegistry {
  register(entry: WorkspaceTabCloseGuardContribution): Dispose;
  snapshot(): readonly WorkspaceTabCloseGuardContribution[];
}

export interface PendingWorkspaceTabClose {
  readonly id: number;
  readonly prompt: WorkspaceTabClosePrompt;
}

export interface WorkspaceTabActionsSnapshot {
  readonly revision: number;
  readonly pendingKindClose: PendingWorkspaceTabClose | null;
  readonly pendingDeleteTabs: number[] | null;
  readonly pendingBulkClose: number[] | null;
}

/** Shared tab workflows used by the header, explorer, shortcuts, and shell.
 * The selected provider owns close-policy orchestration and every compound
 * transition; consumers never reproduce tab state or guard behavior. */
export interface WorkspaceTabActionsCapability {
  snapshot(): WorkspaceTabActionsSnapshot;
  subscribe(listener: () => void): () => void;
  close(id: number): Promise<void>;
  closeMany(anchorId: number, mode: WorkspaceTabBulkCloseMode): Promise<void>;
  newRightOf(anchorId: number): number | null;
  duplicate(id: number): number | null;
  rename(id: number, title: string): void;
  pathDeleted(path: string): void;
  confirmKindClose(): void;
  cancelKindClose(): void;
  confirmDeleteClose(): void;
  cancelDeleteClose(): void;
  confirmBulkClose(): void;
  cancelBulkClose(): void;
}
