import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { ComponentType, ReactNode } from "react";

export const UI_WORKSPACE_VIEWS_SERVICE = "ui.workspace.views";
export const UI_WORKSPACE_FOOTER_SERVICE = "ui.workspace.footer";
export const UI_WORKSPACE_COMPOSER_SERVICE = "ui.workspace-composer";

/** Product-neutral renderer signal used by the workspace shortcut owner to
 * toggle the block-terminal input mode owned by the terminal surface plugin. */
export const TOGGLE_BLOCK_INPUT_EVENT = "termco:toggle-block-input";

export interface UiWorkspaceFooterContribution {
  id: string;
  order?: number;
  Component: ComponentType;
}

export interface UiWorkspaceFooterRegistry {
  register(
    entry: UiWorkspaceFooterContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiWorkspaceFooterContribution[];
  records(): readonly ContributionRecord<UiWorkspaceFooterContribution>[];
  subscribe(listener: () => void): Dispose;
}

export interface UiWorkspaceComposerSnapshot {
  revision: number;
  available: boolean;
  hostedElsewhere: boolean;
}

/** The AI-owned parts of the established block-terminal footer. The terminal
 * plugin owns the surrounding shell input/layout and requests the three
 * historical composer regions without importing AI source. */
export interface UiWorkspaceComposerCapability {
  snapshot(): UiWorkspaceComposerSnapshot;
  subscribe(listener: () => void): () => void;
  focus(): void;
  Region: ComponentType<{
    region: "chips" | "input" | "actions";
    visible: boolean;
    leading?: ReactNode;
  }>;
}

/** Provider-side binding seam. The facade remains registered while a Chat
 * presentation contributes or removes the concrete composer regions. */
export interface UiWorkspaceComposerHostControl {
  bind(delegate: UiWorkspaceComposerCapability): () => void;
}

/** Full workspace-level view, such as Settings or an agent manager. The view
 * plugin owns visibility, layout, navigation, search, and section rendering. */
export interface UiWorkspaceViewContribution {
  id: string;
  label: string;
  description: string;
  order?: number;
  Component: ComponentType;
}

export interface UiWorkspaceViewRegistry {
  register(
    entry: UiWorkspaceViewContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiWorkspaceViewContribution[];
  records(): readonly ContributionRecord<UiWorkspaceViewContribution>[];
  subscribe(listener: () => void): Dispose;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_WORKSPACE_VIEWS_SERVICE]: UiWorkspaceViewRegistry;
    [UI_WORKSPACE_FOOTER_SERVICE]: UiWorkspaceFooterRegistry;
    [UI_WORKSPACE_COMPOSER_SERVICE]: UiWorkspaceComposerCapability;
  }
}
