import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { LspSessionsCapability } from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export type EditorRuntime = {
  files: WorkspaceFilesCapability;
  lsp: LspSessionsCapability;
  preferences: PreferencesCapability;
  theme: UiThemeCapability;
  events: ApplicationEventsCapability;
  inference: AiInferenceCapability;
};

let selected: EditorRuntime | null = null;
let workspace: WorkspaceEnv = { kind: "local" };

export function configureEditorRuntime(runtime: EditorRuntime): () => void {
  selected = runtime;
  return () => {
    if (selected === runtime) selected = null;
  };
}

export function editorRuntime(): EditorRuntime {
  if (!selected) throw new Error("editor surface runtime is not active");
  return selected;
}

export function setCurrentWorkspace(next: WorkspaceEnv): void {
  workspace = next;
}

export function currentWorkspace(): WorkspaceEnv {
  return workspace;
}
