import type { PluginModule } from "@termco/kernel";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import {
  WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
  type WorkspaceTabCloseGuardRegistry,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { createWorkspaceTabCloseGuardRegistry } from "./registry";
import { WorkspaceTabsStore } from "./store";

let selected: WorkspaceTabsStore | null = null;

export function workspaceTabsRuntimeActive(): boolean {
  return selected !== null;
}

const plugin: PluginModule = {
  inject: [],
  replacementImpact() {
    const tabs = selected?.snapshot().tabs ?? [];
    return tabs.length === 0
      ? []
      : [
          {
            capability: "workspace.tabs",
            resourceLabel: "open workspace tabs",
            resources: tabs.map((tab) => ({
              id: String(tab.id),
              label: tab.title,
            })),
          },
        ];
  },
  async activate(context) {
    const store = new WorkspaceTabsStore();
    context.provide<WorkspaceTabCloseGuardRegistry>(
      WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
      createWorkspaceTabCloseGuardRegistry(),
    );
    selected = store;
    await context.effect(() => () => {
      if (selected === store) selected = null;
    });
    context.provide<WorkspaceTabsCapability>("workspace.tabs", store);
    context.feature(
      {
        id: "preference-persistence",
        label: "Workspace tab persistence",
        requires: [SETTINGS_PREFERENCES_SERVICE],
        uiPolicy: "fallback",
      },
      (feature) =>
        store.bindPreferences(
          feature.get<PreferencesCapability>(SETTINGS_PREFERENCES_SERVICE),
        ),
    );
  },
};

export default plugin;
