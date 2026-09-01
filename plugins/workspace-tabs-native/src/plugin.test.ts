import { CapabilityRuntime } from "@termco/kernel";
import type { PreferencesCapability } from "@termco/storage-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { describe, expect, it } from "vitest";
import plugin from "./plugin";
import { WORKSPACE_TAB_LAYOUTS_KEY } from "./store";

function manifest(id: string) {
  return {
    schemaVersion: 3,
    id,
    name: id,
    description: id,
    category: "Test",
    version: "1.0.0",
    entrypoints: { renderer: "src/plugin.ts" },
    dependencies: {},
  };
}

describe("workspace tabs persistence granularity", () => {
  it("retains tabs and provider identity while preferences leave and return", async () => {
    const tabsPlugin = manifest("workspace-tabs-native");
    const preferencesPlugin = manifest("preferences-json");
    const runtime = new CapabilityRuntime({
      profileId: "test.workspace-tabs",
      plugins: [tabsPlugin, preferencesPlugin].map((entry) => ({
        id: entry.id,
        manifest: entry,
        source: {
          type: "local",
          module: entry.id,
          location: entry.id,
          integrity: entry.id,
        },
      })),
      activationOrder: [tabsPlugin.id, preferencesPlugin.id],
    } as never);
    let stored: unknown = [
      {
        rigId: "saved",
        tabs: [{ kind: "terminal" }],
        activeTabIndex: 0,
        splitTabIndex: -1,
      },
    ];
    const preferences: PreferencesCapability = {
      get: async <T,>(key: string) =>
        (key === WORKSPACE_TAB_LAYOUTS_KEY ? stored : undefined) as T,
      getMany: async () => ({}),
      set: async (key, value) => {
        if (key === WORKSPACE_TAB_LAYOUTS_KEY) stored = value;
      },
      delete: async () => false,
      subscribe: () => () => {},
    };

    await runtime.activate(tabsPlugin.id, plugin);
    const tabs = runtime.platformCapability<WorkspaceTabsCapability>(
      "workspace.tabs",
    );
    tabs.initialize({
      tabs: [
        {
          id: 1,
          rigId: "default",
          kind: "terminal",
          title: "Terminal 1",
        },
      ],
      activeId: 1,
    });

    await runtime.activate(preferencesPlugin.id, {
      activate: (context) =>
        context.provide("settings.preferences", preferences),
    });
    expect(runtime.platformCapability("workspace.tabs")).toBe(tabs);
    expect(tabs.savedLayouts().map((layout) => layout.rigId)).toEqual([
      "saved",
    ]);

    await runtime.deactivate(preferencesPlugin.id);
    expect(runtime.platformCapability("workspace.tabs")).toBe(tabs);
    expect(tabs.snapshot().tabs).toEqual([
      expect.objectContaining({ id: 1, title: "Terminal 1" }),
    ]);
    await tabs.saveLayout({
      rigId: "offline",
      tabs: [{ kind: "editor", path: "/tmp/a.ts" }],
      activeTabIndex: 0,
      splitTabIndex: -1,
    });
    expect(runtime.lifecycleDiagnostics(tabsPlugin.id).successfulActivations).toBe(
      1,
    );

    await runtime.activate(preferencesPlugin.id, {
      activate: (context) =>
        context.provide("settings.preferences", preferences),
    });
    expect(runtime.platformCapability("workspace.tabs")).toBe(tabs);
    expect((stored as Array<{ rigId: string }>).map(({ rigId }) => rigId)).toEqual(
      ["saved", "offline"],
    );
  });
});
