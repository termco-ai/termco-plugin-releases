import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type { ComponentType } from "react";

export const UI_AI_DOCK_VIEWS_SERVICE = "ui.ai-dock.views";
export const UI_DOCK_SURFACES_SERVICE = "ui.dock.surfaces";

export interface UiDockSurfaceContribution {
  id: string;
  order?: number;
  Component: ComponentType;
}

export interface UiDockSurfaceRegistry {
  register(
    entry: UiDockSurfaceContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiDockSurfaceContribution[];
  records(): readonly ContributionRecord<UiDockSurfaceContribution>[];
  subscribe(listener: () => void): Dispose;
}

/** Context for a feature tab inside the docked AI surface. The dock owns only
 * selection/layout; the contributing plugin owns the complete tab body. */
export interface UiAiDockRuntime {
  activeRigId: string | null;
  activeRigName: string;
  cwd: string;
  workspace: NonNullable<WorkspaceEnv>;
  /** Open a shared terminal in the run's original environment and folder. */
  openTerminal(cwd: string, workspace?: AgentWorkspaceLike): Promise<void>;
}

export type AgentWorkspaceLike =
  | NonNullable<WorkspaceEnv>
  | { kind: "wsl"; distro?: string }
  | null;

/** Optional reactive state owned by a dock contribution. The dock can display
 * a badge and honor navigation requests without importing the plugin's store. */
export interface UiAiDockViewController {
  subscribe(listener: () => void): () => void;
  badge(): number;
  consumeOpenRequest(): boolean;
}

export interface UiAiDockViewContribution {
  id: string;
  label: string;
  description: string;
  order?: number;
  controller?: UiAiDockViewController;
  Component: ComponentType<{ runtime: UiAiDockRuntime }>;
}

export interface UiAiDockViewRegistry {
  register(
    entry: UiAiDockViewContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiAiDockViewContribution[];
  records(): readonly ContributionRecord<UiAiDockViewContribution>[];
  subscribe(listener: () => void): Dispose;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_AI_DOCK_VIEWS_SERVICE]: UiAiDockViewRegistry;
    [UI_DOCK_SURFACES_SERVICE]: UiDockSurfaceRegistry;
  }
}
