import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type {
  UiHeaderFindOptions,
  UiHeaderFindTarget,
  UiHeaderTab,
} from "@termco/ui-header-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type { ComponentType } from "react";

export const UI_TABS_PRESENTATION_SERVICE = "ui.tabs.presentation";
export const UI_TABS_KINDS_SERVICE = "ui.tabs.kinds";
export const UI_SURFACE_SEARCH_SERVICE = "ui.surface-search";

/** Shared tab presentation selected with the header. The shell may reuse the
 * exact icon in split-pane chrome without importing or duplicating header
 * source. Replacing the header replaces this presentation atomically. */
export interface UiTabPresentationCapability {
  Icon: ComponentType<{ tab: UiHeaderTab }>;
}

/** Application-wide registry of search handles owned by mounted tab surfaces.
 * The selected provider keeps split panes independent and makes stale
 * unmounts unable to clear a replacement surface's handle. */
export interface UiSurfaceSearchCapability {
  register(tabId: number, target: UiHeaderFindTarget): () => void;
  target(tabId: number): UiHeaderFindTarget | null;
  subscribe(listener: () => void): () => void;
}

export interface UiTabDescriptor {
  id: number;
  rigId: string;
  kind: string;
  title: string;
  cold: boolean;
  path?: string;
  url?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface UiTabsRuntime {
  workspace: WorkspaceEnv;
  /** Resolve the environment/root belonging to a tab's rig. Surfaces must not
   * accidentally read a background SSH/WSL tab through the active rig. */
  workspaceForRig(rigId: string): WorkspaceEnv;
  rootPathForRig(rigId: string): string | null;
  /** Complete tab read model. A surface receives only the tabs in its pane,
   * while integrations such as browser automation may need rig-wide tabs. */
  allTabs(): readonly UiTabDescriptor[];
  activeTabId(rigId?: string): number | null;
  /** Open one of the application tab kinds. The owning surface defines the
   * payload; the shell only persists and activates the tab. */
  openTab(kind: string, data: Readonly<Record<string, unknown>>): number;
  updateTab(id: number, patch: Readonly<Record<string, unknown>>): void;
  /** Replace one tab's complete opaque record. This is used when a feature
   * changes presentation kind (for example Markdown rendered/raw) without
   * teaching the shell about that feature's fields. */
  replaceTab(tab: UiTabDescriptor): void;
  selectTab(id: number): void;
  closeTab(id: number): void;
  /** Execute visibly in a new shared terminal tab. */
  runInNewTerminal(command: string, cwd?: string): Promise<void>;
  /** Register the active surface's header-driven text filter. */
  registerSearchHandle(handle: UiTabSearchHandle | null): void;
  /** Native views paint above DOM overlays. The shell projects its shared
   * overlay tracker so source-owned surfaces can hide only when occluded. */
  subscribeOverlays(listener: () => void): () => void;
  overlayRects(): readonly UiScreenRect[];
  hasUnpositionedOverlay(): boolean;
  /** Bridge into the selected AI composer until that complete surface is
   * source-owned and supplies its own renderer capability. */
  canAttachImageToAi(): boolean;
  attachSelectionToAi(text: string, source: "terminal" | "editor"): void;
  attachImageToAi(input: {
    dataUrl: string;
    name: string;
    text?: string;
    pageElement?: {
      url: string;
      title: string;
      tag: string;
      role?: string;
      accessibleName?: string;
      text?: string;
    };
  }): void;
}

export interface UiScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface UiTabSearchHandle {
  setQuery(query: string): void;
  clearQuery(): void;
  findNext?(query: string, options?: UiHeaderFindOptions): void;
  findPrevious?(query: string, options?: UiHeaderFindOptions): void;
  focus?(): void;
}

export interface UiGitCommitFileRequest {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
}

export interface UiTabSurfaceProps {
  tabs: readonly UiTabDescriptor[];
  activeId: number;
  surfaceVisible: boolean;
  runtime: UiTabsRuntime;
}

export type UiTabCloseVerdict =
  | "close"
  | {
      prompt: {
        title: string;
        body: string;
        confirmLabel: string;
      };
    };

/** Complete renderer for one or more tab kinds. The shell only adapts the
 * current tab read model and actions; source plugins own all surface UI. */
export interface UiTabKindContribution {
  id: string;
  label: string;
  description: string;
  kinds: readonly string[];
  mountWhen?: "always" | "whenOpen";
  receivesVisibility?: boolean;
  canClose?(
    tab: UiTabDescriptor,
  ): Promise<UiTabCloseVerdict> | UiTabCloseVerdict;
  Component: ComponentType<UiTabSurfaceProps>;
}

export interface UiTabKindRegistry {
  register(
    entry: UiTabKindContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiTabKindContribution[];
  records(): readonly ContributionRecord<UiTabKindContribution>[];
  subscribe(listener: () => void): Dispose;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_TABS_PRESENTATION_SERVICE]: UiTabPresentationCapability;
    [UI_TABS_KINDS_SERVICE]: UiTabKindRegistry;
    [UI_SURFACE_SEARCH_SERVICE]: UiSurfaceSearchCapability;
  }
}
