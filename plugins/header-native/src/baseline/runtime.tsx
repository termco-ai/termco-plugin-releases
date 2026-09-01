import type { AgentHooksCapability } from "@termco/agents-base";
import type { EditorLanguagesCapability } from "@termco/editor-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { SshClientCapability } from "@termco/ssh-base";
import ui from "@termco/ui";

export interface BaselineHeaderDependencies {
  agentHooks: AgentHooksCapability;
  fileIcons: WorkspaceFileIconsCapability;
  languages: EditorLanguagesCapability;
  shortcuts: ShortcutRegistryCapability;
  ssh: SshClientCapability;
}

let selected: BaselineHeaderDependencies | null = null;

export function installHeaderDependencies(
  dependencies: BaselineHeaderDependencies,
): () => void {
  selected = dependencies;
  return () => {
    if (selected === dependencies) selected = null;
  };
}

export function headerDependencies(): BaselineHeaderDependencies {
  if (!selected) throw new Error("Default header dependencies are not active");
  return selected;
}

export function useShortcutLabel(id: string, _platform: string): string {
  const shortcuts = headerDependencies().shortcuts;
  ui.React.useSyncExternalStore(
    (listener) => shortcuts.subscribe(listener),
    () => shortcuts.snapshot(),
    () => shortcuts.snapshot(),
  );
  return shortcuts
    .format(shortcuts.bindings(id)[0])
    .join(" ");
}
