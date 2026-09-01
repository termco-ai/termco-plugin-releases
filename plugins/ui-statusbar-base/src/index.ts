import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type { ComponentType, ReactNode } from "react";

export const UI_STATUSBAR_ITEMS_SERVICE = "ui.statusbar.items";

export interface UiStatusbarAgentState {
  status: "idle" | "thinking" | "streaming" | "awaiting-approval" | "awaiting-input" | "error";
  step: string | null;
  error: string | null;
}

export interface UiStatusbarWslDistro {
  name: string;
  default: boolean;
  running: boolean;
}

/** Plugin-internal read model used by the established status-bar component
 * tree. The source-owning contribution constructs it from public capabilities. */
export interface UiStatusbarRuntime {
  platform: "macos" | "windows" | "linux" | "unknown";
  zenMode: boolean;
  cwd: string | null;
  filePath: string | null;
  home: string | null;
  privateActive: boolean;
  workspace: NonNullable<WorkspaceEnv>;
  wslDistros: readonly UiStatusbarWslDistro[];
  wslLoading: boolean;
  wslError: string | null;
  lspServerId: string | null;
  ai: UiStatusbarAgentState;
  aiSurfaceOpen: boolean;
  sendCd(path: string): void;
  changeWorkspace(env: NonNullable<WorkspaceEnv>): void;
  refreshWslDistros(): Promise<readonly UiStatusbarWslDistro[]>;
  openLanguagesSettings(): void;
  openAi(): void;
}

export interface UiStatusbarRootSlots {
  /** Ordered contributions targeting the generic left statusbar region. */
  leftItems?: ReactNode;
  /** Ordered contributions targeting the generic right statusbar region. */
  rightItems?: ReactNode;
}

export interface UiStatusbarItemContribution {
  id: string;
  label: string;
  description: string;
  /** A complete status-bar plugin contributes `root`; smaller extension
   * plugins target its left/right slots without replacing its chrome. */
  side: "root" | "left" | "right";
  order?: number;
  /** Root components receive the ordered extension slots. Item components
   * ignore these optional props and resolve their own declared capabilities. */
  Component: ComponentType<UiStatusbarRootSlots>;
}

export interface UiStatusbarItemRegistry {
  register(
    entry: UiStatusbarItemContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiStatusbarItemContribution[];
  records(): readonly ContributionRecord<UiStatusbarItemContribution>[];
  subscribe(listener: () => void): Dispose;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_STATUSBAR_ITEMS_SERVICE]: UiStatusbarItemRegistry;
  }
}
