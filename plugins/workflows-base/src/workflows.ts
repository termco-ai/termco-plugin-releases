export type WorkflowParamSource =
  | "text"
  | "enum"
  | "container"
  | "container_image"
  | "ssh_host"
  | "terminal"
  | "port"
  | "branch"
  | "git_remote"
  | "file"
  | "cwd";

export interface WorkflowParameter {
  name: string;
  description?: string;
  default?: string;
  source: WorkflowParamSource;
  required?: boolean;
  enumValues?: string[];
  quote?: boolean;
}

export type WorkflowTarget =
  | { kind: "new_terminal"; cwd?: "inherit" | string }
  | { kind: "focused_terminal" }
  | { kind: "container"; ref?: string }
  | { kind: "ssh"; ref?: string }
  | { kind: "ai" };

export type WorkflowSource = "builtin" | "user" | "rig" | "plugin";

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  command: string;
  steps?: string[];
  parameters: WorkflowParameter[];
  tags: string[];
  target: WorkflowTarget;
  source: WorkflowSource;
  confirm?: boolean;
  favorite?: boolean;
  icon?: string;
  env?: string;
  rigId?: string;
}

export type WorkflowValues = Record<string, string>;

export interface WorkflowResourceOption {
  value: string;
  label: string;
  hint?: string;
}

export interface WorkflowRunRequest {
  workflow: WorkflowDefinition;
  values: WorkflowValues;
  target: WorkflowTarget;
  command: string;
}

export type WorkflowRunOutcome =
  | { ok: true; command: string }
  | { ok: false; error: string; unavailable?: true };

export interface WorkflowRunnerContribution {
  id: string;
  targetKinds: readonly WorkflowTarget["kind"][];
  available(target: WorkflowTarget): boolean;
  run(request: WorkflowRunRequest): Promise<WorkflowRunOutcome>;
}

export interface WorkflowRunnerRegistry {
  register(entry: WorkflowRunnerContribution): Dispose;
  snapshot(): readonly WorkflowRunnerContribution[];
  resolve(target: WorkflowTarget): WorkflowRunnerContribution | undefined;
  subscribe(listener: () => void): Dispose;
}

export interface WorkflowParameterSourceContribution {
  id: string;
  sources: readonly WorkflowParamSource[];
  options(input: {
    source: WorkflowParamSource;
    workspace: unknown;
    rootPath: string | null;
  }): Promise<readonly WorkflowResourceOption[]>;
}

export interface WorkflowParameterSourceRegistry {
  register(entry: WorkflowParameterSourceContribution): Dispose;
  snapshot(): readonly WorkflowParameterSourceContribution[];
  resolve(
    source: WorkflowParamSource,
  ): WorkflowParameterSourceContribution | undefined;
  subscribe(listener: () => void): Dispose;
}

export interface WorkflowAvailability {
  available: boolean;
  reason?: string;
}

export interface WorkflowRun {
  workflowId: string;
  command: string;
  values: WorkflowValues;
  target: WorkflowTarget;
  at: number;
}

export interface WorkflowsSnapshot {
  hydrated: boolean;
  workflows: readonly WorkflowDefinition[];
  userWorkflows: readonly WorkflowDefinition[];
  favoriteIds: readonly string[];
  recent: readonly WorkflowRun[];
}

/** A plugin-owned set of definitions merged into the selected workflow
 * library. Definitions are ephemeral and disappear when their plugin does. */
export interface WorkflowDefinitionsContribution {
  id: string;
  workflows: readonly WorkflowDefinition[];
}

export interface WorkflowDefinitionsRegistry {
  register(entry: WorkflowDefinitionsContribution): Dispose;
  snapshot(): readonly WorkflowDefinitionsContribution[];
  subscribe(listener: () => void): Dispose;
}

/** One application-wide workflow library. The provider owns built-ins,
 * persistence, rendering rules, favourites, and run history; UI and AI tools
 * consume the same live snapshot instead of creating parallel stores. */
export interface WorkflowsLibraryCapability {
  snapshot(): WorkflowsSnapshot;
  subscribe(listener: () => void): () => void;
  all(): readonly WorkflowDefinition[];
  visible(rigId: string | null): readonly WorkflowDefinition[];
  get(id: string): WorkflowDefinition | undefined;
  isFavorite(id: string): boolean;
  lastValues(id: string): WorkflowValues | undefined;
  newId(): string;
  extractPlaceholders(template: string): string[];
  renderSteps(workflow: WorkflowDefinition, values: WorkflowValues): string[];
  missingRequired(workflow: WorkflowDefinition, values: WorkflowValues): string[];
  availability(workflow: WorkflowDefinition): WorkflowAvailability;
  run(
    workflow: WorkflowDefinition,
    values: WorkflowValues,
    target?: WorkflowTarget,
  ): Promise<WorkflowRunOutcome>;
  upsert(workflow: WorkflowDefinition): Promise<void>;
  remove(id: string): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  recordRun(run: WorkflowRun): Promise<void>;
}
import type { Dispose } from "@termco/kernel";
