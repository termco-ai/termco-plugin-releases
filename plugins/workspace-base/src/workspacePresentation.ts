import type { UiHeaderFindTarget, UiHeaderTab } from "@termco/ui-header-base";
import type { WorkspaceEnv } from "./workspace";

export interface WorkspacePresentationSnapshot {
  revision: number;
  header: {
    tabs: readonly UiHeaderTab[];
    allTabs: readonly UiHeaderTab[];
    activeTabId: number;
    agentsViewOpen: boolean;
    editorDirty: boolean;
    findTarget: UiHeaderFindTarget | null;
  };
  sidebar: {
    rootPath: string | null;
    workspace: NonNullable<WorkspaceEnv>;
    activeFilePath: string | null;
  };
  /** Derived context for chrome and shell integrations. Tab identity and tab
   * payloads remain owned exclusively by workspace.tabs. */
  context: {
    cwd: string | null;
    filePath: string | null;
    home: string | null;
    privateActive: boolean;
    zenMode: boolean;
  };
}

export type WorkspacePresentationState = Omit<
  WorkspacePresentationSnapshot,
  "revision"
>;

/** Read-only selected workspace UI state for independently bundled shell,
 * header, sidebar, overlay, and background consumers. */
export interface WorkspacePresentationCapability {
  snapshot(): WorkspacePresentationSnapshot;
  subscribe(listener: () => void): () => void;
}

/** Narrow publication port consumed only by the selected workspace shell. */
export interface WorkspacePresentationControlCapability {
  publish(state: WorkspacePresentationState): void;
}
