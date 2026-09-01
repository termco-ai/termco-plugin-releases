import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { UiHeaderRig } from "@termco/ui-header-base";

export const UI_COMMANDS_SERVICE = "ui.commands";

export interface UiCommandRuntime {
  showSidebarView(id: string): void;
  rigs(): readonly UiHeaderRig[];
  activeRigId(): string | null;
  cycleRig(delta: 1 | -1): void;
  activateRig(id: string): void;
}

export interface UiCommandItem {
  id: string;
  title: string;
  description: string;
  group: string;
  keywords?: readonly string[];
  shortcutId?: string;
  trailing?: string;
  disabledReason?: string;
  order?: number;
  icon?: unknown;
  run(runtime: UiCommandRuntime): void | Promise<void>;
}

export interface UiCommandSourceContribution {
  id: string;
  order?: number;
  /** Optional invalidation signal for dynamic command catalogues. */
  subscribe?(listener: () => void): () => void;
  commands(runtime: UiCommandRuntime): readonly UiCommandItem[];
}

export type UiCommandContribution = UiCommandItem | UiCommandSourceContribution;

export interface UiCommandRegistry {
  register(
    entry: UiCommandContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiCommandContribution[];
  records(): readonly ContributionRecord<UiCommandContribution>[];
  subscribe(listener: () => void): Dispose;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_COMMANDS_SERVICE]: UiCommandRegistry;
  }
}
