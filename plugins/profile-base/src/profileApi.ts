import type { PluginCatalogItem } from "./catalog";
import type { FeatureUiPolicy, LiveResourceImpact } from "@termco/kernel";
import type {
  UiContributionCapability,
  UiContributionVerificationExpectation,
} from "@termco/ui-shell-base";

export interface PluginDisableImpact {
  previewId: string;
  generation: number;
  pluginId: string;
  enabled: boolean;
  blockedPlugins: Array<{
    pluginId: string;
    missingServices: string[];
    via: string[];
  }>;
  unavailableFeatures: Array<{
    pluginId: string;
    featureId: string;
    label: string;
    uiPolicy: FeatureUiPolicy;
    missingServices: string[];
  }>;
  degradedPlugins: Array<{
    pluginId: string;
    optionalServices: string[];
  }>;
  destructiveResources: LiveResourceImpact[];
}

export interface PluginEnabledResult {
  status: "replaced" | "cancelled";
  pluginId: string;
  enabled: boolean;
  warning?: { message: string };
}

export interface PluginEnableConfirmation {
  previewId: string;
  generation: number;
}

interface PluginMutationResultBase {
  pluginId: string;
  sourceFolder: string;
  warning?: { message: string };
}

export type PluginMutationResult =
  | (PluginMutationResultBase & {
      status: "draft" | "cancelled";
      generation: null;
      completionId: null;
    })
  | (PluginMutationResultBase & {
      status: "replaced";
      /** Exact source integrity mounted by the successful live apply. */
      generation: string;
      /** Stable identity for verification, reveal, and undo of this apply. */
      completionId: string;
    });

export interface PluginCompletionStages {
  scaffolded: boolean;
  validated: boolean;
  compiled: boolean;
  profileCommitted: boolean;
  graphSettled: boolean;
  contributionRegistered: boolean | null;
  visiblyVerified: boolean;
}

export type PluginCreationTarget =
  | UiContributionCapability
  | "main-provider"
  | "renderer-provider"
  | "server";

export interface PluginCreateRequest {
  id: string;
  name: string;
  description: string;
  category: string;
  target: PluginCreationTarget;
  variant?: string;
  onboarding?: PluginOnboardingPlan;
}

export type PluginOnboardingStepPlan = {
  id: string;
  version: number;
  title: string;
  kind: "information" | "tour" | "interaction" | "navigation" | "check" | "action";
  instruction: string;
  targetId?: string;
  expectation?:
    | { kind: "click" }
    | { kind: "input"; completion: "non-empty" | "changed" }
    | { kind: "selection"; completion: "changed" }
    | { kind: "event"; name: string };
};

export type PluginOnboardingPlan =
  | {
      decision: "include";
      rationale: string;
      journey: {
        id: string;
        title: string;
        description: string;
        presentation: "contextual" | "available";
        steps: readonly PluginOnboardingStepPlan[];
      };
    }
  | { decision: "omit"; rationale: string }
  | { decision: "not-applicable"; rationale: string };

export interface PluginAuthoringPlanRequest {
  intent: "create" | "fork" | "replace";
  plugin: {
    id: string;
    name: string;
    description: string;
    category: string;
  };
  sourcePluginId?: string;
  target: PluginCreationTarget;
  variant?: string;
  contributions: readonly UiContributionVerificationExpectation[];
  reveal: "auto" | "offer" | "none";
  /** Frozen when authored by the Plugin Creator; optional for manual callers. */
  onboarding?: PluginOnboardingPlan;
}

export interface PluginAuthoringPlanResult extends PluginAuthoringPlanRequest {
  planId: string;
}

export interface PluginCreateResult {
  status: "draft" | "cancelled";
  pluginId: string;
  sourceFolder: string;
  warning?: { message: string };
  stages: PluginCompletionStages;
}

export interface PluginForkRequest {
  pluginId: string;
  forkId: string;
  name?: string;
}

export interface PluginForkResult {
  status: "forked" | "cancelled";
  pluginId: string;
  sourceFolder: string;
  warning?: { message: string };
  stages?: PluginCompletionStages;
}

export interface PluginUninstallResult {
  status: "uninstalled" | "cancelled";
  pluginId: string;
  sourceFolder: string;
  /** Source deletion is recoverable through the operating-system Trash. */
  movedToTrash: boolean;
  warning?: { message: string };
}

export interface ProfileActivationResult {
  status: "replaced" | "cancelled";
  profileId: string;
  warning?: { message: string };
}

export type ProfileKind = "default" | "personal" | "imported";

export interface ProfileSummary {
  id: string;
  name: string;
  description: string;
  version?: string;
  kind: ProfileKind;
  active: boolean;
  pluginCount: number;
  inactivePluginCount: number;
  customPluginCount: number;
}

export interface ProfileManagementSnapshot {
  activeProfileId: string;
  profiles: readonly ProfileSummary[];
}

export interface ProfileExportRequest {
  name: string;
  description: string;
  version: string;
}

export type ProfileExportResult =
  | { status: "cancelled" }
  | {
      status: "exported";
      path: string;
      name: string;
      version: string;
      pluginCount: number;
      packagedPluginCount: number;
    };

export type ProfileImportResult =
  | { status: "cancelled" }
  | {
      status: "imported" | "already-installed";
      profileId: string;
      name: string;
      version: string;
      pluginCount: number;
      packagedPluginCount: number;
    };

export interface PluginUndoResult {
  status: "replaced" | "cancelled";
  completionId: string;
  pluginId: string;
  warning?: { message: string };
}

export interface PluginDraftItem {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  sourceFolder: string;
  forkedFrom?: string;
  replaces?: string;
}

/** Profile mechanics exposed by the selected ordinary profile-family provider.
 * The provider delegates compilation and graph commits to kernel host control;
 * product UI remains replaceable. */
export interface PluginProfileApi {
  catalog(): readonly PluginCatalogItem[];
  /** List selectable default, personal, and imported profiles. */
  profileSnapshot(): Promise<ProfileManagementSnapshot>;
  /** Export the active effective profile and complete non-bundled plugin sources. */
  exportProfile(request: ProfileExportRequest): Promise<ProfileExportResult>;
  /** Choose, validate, and install an immutable Profile Package without activating it. */
  importProfile(): Promise<ProfileImportResult>;
  /** Observe committed profile-catalog changes without coupling product UI to
   * the renderer runtime. Preserved plugins use this to follow live graph
   * replacement while keeping their own local UI state. */
  subscribe(listener: () => void): () => void;
  listSourceFiles(pluginId: string): Promise<string[]>;
  readSourceFile(pluginId: string, relativePath: string): Promise<string>;
  writeSourceFile(
    pluginId: string,
    relativePath: string,
    content: string,
  ): Promise<void>;
  copyAndReplace(planId: string): Promise<PluginMutationResult>;
  /** Compile and transactionally apply a managed draft or source edit. */
  apply(pluginId: string): Promise<PluginMutationResult>;
  /** Reveal the exact selected or managed draft source directory in the OS. */
  openPluginFolder(pluginId: string): Promise<{ path: string }>;
  /** Disable one user-installed replacement and restore the inherited plugin.
   * Its source folder is moved to the operating-system Trash after commit. */
  uninstall(pluginId: string): Promise<PluginUninstallResult>;
  /** Compute the exact dependency and resource consequences against the
   * current committed graph. The returned generation must be confirmed. */
  previewSetEnabled(
    pluginId: string,
    enabled: boolean,
  ): Promise<PluginDisableImpact>;
  /** Commit only the mutation described by a still-current preview. */
  setEnabled(
    pluginId: string,
    enabled: boolean,
    confirmation: PluginEnableConfirmation,
  ): Promise<PluginEnabledResult>;
  /** Transactionally activate a named base profile through a fresh derived
   * layer. Used by protected recovery UI without exposing profile files. */
  activate(profileId: string): Promise<ProfileActivationResult>;
}

/** Additive authoring operations layered over the frozen profile transaction
 * contract. Existing profile consumers remain source-compatible. */
export interface PluginAuthoringProfileApi extends PluginProfileApi {
  /** List compiled managed plugin folders that are deliberately absent from
   * the active profile. */
  listDrafts(): Promise<readonly PluginDraftItem[]>;
  /** Register the immutable main-process preflight required by every draft
   * mutation. */
  plan(request: PluginAuthoringPlanRequest): Promise<PluginAuthoringPlanResult>;
  /** Scaffold and compile one independent managed draft without adding a
   * profile row. Creation never claims or disables an existing plugin. */
  create(planId: string): Promise<PluginCreateResult>;
  /** Copy a selected plugin into an independent managed draft. A fork never
   * declares `replaces` and never disables its source row. */
  fork(planId: string): Promise<PluginForkResult>;
  /** Restore the exact profile snapshot preceding a still-current successful
   * authoring apply. A stale completion is rejected instead of overwriting
   * later profile changes. */
  undo(completionId: string): Promise<PluginUndoResult>;
}
