import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { ComponentType, ReactNode } from "react";
import type { UiContributionCapability } from "./generated/authoringCatalog";
export {
  UI_CONTRIBUTION_AUTHORING_DESCRIPTORS,
} from "./generated/authoringCatalog";
export type { UiContributionCapability } from "./generated/authoringCatalog";

export const UI_SHELL_SERVICE = "ui.shell";
export const UI_PROVIDERS_SERVICE = "ui.providers";
export const UI_BACKGROUND_TASKS_SERVICE = "ui.background.tasks";
export const UI_CONTRIBUTION_EVIDENCE_SERVICE = "ui.contribution-evidence";

/** Product-neutral DOM seam used by a tab-strip plugin to locate the shell's
 * workspace surface for drag-to-split feedback. The shell owns the surface;
 * the tab-strip plugin owns every pixel and gesture rendered into it. */
export const WORKSPACE_SURFACE_ATTR = "data-workspace-surface";

export interface UiContributionRef {
  service: UiContributionCapability;
  pluginId: string;
  key: string;
  contributionId: string;
  generation: string;
}

export interface UiVisibleTargetExpectation {
  role: string;
  name: string;
}

export type UiVerificationPostcondition =
  | { selectedContribution: string }
  | { role: string; name: string; visible: true };

export type UiVerificationAction =
  | { kind: "activate" }
  | { kind: "click"; target: UiVisibleTargetExpectation };

export interface UiContributionVerificationExpectation {
  contribution: { service: UiContributionCapability; key: string };
  present: true;
  visibleTarget?: UiVisibleTargetExpectation;
  actions?: readonly UiVerificationAction[];
  after?: readonly UiVerificationPostcondition[];
}

export type UiContributionVerificationStage =
  | "contribution-registered"
  | "surface-mounted"
  | "visible-target"
  | "interaction"
  | "postcondition";

export interface UiContributionVerificationReport {
  ok: boolean;
  pluginId: string;
  generation: string;
  refs: readonly UiContributionRef[];
  completedStages: readonly UiContributionVerificationStage[];
  failedStage?: UiContributionVerificationStage;
  message: string;
}

export interface UiContributionEvidenceCapability {
  snapshot(): readonly UiContributionRef[];
  subscribe(listener: () => void): Dispose;
  verify(input: {
    pluginId: string;
    generation: string;
    expectations: readonly UiContributionVerificationExpectation[];
  }): Promise<UiContributionVerificationReport>;
}

export interface UiContributionAuthoringDescriptor {
  service: UiContributionCapability;
  aliases: string;
  contractPackage: string;
  serviceConstant: string;
  registryType: string;
  contributionType: string;
  variants?: readonly string[];
  requiredFields: readonly string[];
  collisionPolicy: string;
  verification: {
    target: string;
    postcondition: string;
  };
  reveal:
    | "none"
    | "sidebar-view"
    | "header-item"
    | "statusbar-item"
    | "tab-kind"
    | "settings-section"
    | "workspace-view"
    | "ai-dock-view"
    | "dock-surface"
    | "workspace-footer"
    | "overlay"
    | "command";
  minimalUsage: string;
}

/** Generic shell composition seams. Feature plugins own the provider and
 * surface implementations; the shell only orders and mounts them. */
export interface UiProviderContribution {
  id: string;
  order?: number;
  Component: ComponentType<{ children: ReactNode }>;
}

export interface UiProviderRegistry {
  register(
    entry: UiProviderContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiProviderContribution[];
  records(): readonly ContributionRecord<UiProviderContribution>[];
  subscribe(listener: () => void): Dispose;
}

export interface UiBackgroundContribution {
  id: string;
  label: string;
  description: string;
  order?: number;
  /** The contribution resolves its own declared capabilities. */
  Component: ComponentType;
}

export interface UiBackgroundRegistry {
  register(
    entry: UiBackgroundContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiBackgroundContribution[];
  records(): readonly ContributionRecord<UiBackgroundContribution>[];
  subscribe(listener: () => void): Dispose;
}

/** Application-wide renderer composition selected by the active profile. */
export interface UiShellCapability {
  /** Complete renderer application root owned by the selected shell plugin. */
  Root: ComponentType;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_SHELL_SERVICE]: UiShellCapability;
    [UI_PROVIDERS_SERVICE]: UiProviderRegistry;
    [UI_BACKGROUND_TASKS_SERVICE]: UiBackgroundRegistry;
    [UI_CONTRIBUTION_EVIDENCE_SERVICE]: UiContributionEvidenceCapability;
  }
}
