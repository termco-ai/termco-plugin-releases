import { CapabilityRuntime } from "@termco/kernel";
import type { UiFileIconsCapability } from "@termco/files-base";
import { describe, expect, it } from "vitest";
import plugin from "./plugin";

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

describe("stable file icon registry", () => {
  it("keeps generic icons and identity while Explorer resolvers leave and return", async () => {
    const iconsPlugin = manifest("file-icons-native");
    const explorerPlugin = manifest("explorer-sidebar");
    const runtime = new CapabilityRuntime({
      profileId: "test.file-icons",
      plugins: [iconsPlugin, explorerPlugin].map((entry) => ({
        id: entry.id,
        manifest: entry,
        source: {
          type: "local",
          module: entry.id,
          location: entry.id,
          integrity: entry.id,
        },
      })),
      activationOrder: [iconsPlugin.id, explorerPlugin.id],
    } as never);

    await runtime.activate(iconsPlugin.id, plugin);
    const icons = runtime.platformCapability<UiFileIconsCapability>(
      "ui.file-icons",
    );
    const fallback = icons.fileIconUrl("index.ts");
    expect(fallback).toContain("data:image/svg+xml");

    const activateExplorer = () =>
      runtime.activate(explorerPlugin.id, {
        inject: ["ui.file-icons"],
        activate(context) {
          const registry = context.get<UiFileIconsCapability>("ui.file-icons");
          return registry.registerResolver({
            id: "explorer.catalogue",
            priority: 100,
            fileIconUrl: (name) =>
              name.endsWith(".ts") ? "icon:typescript" : null,
            folderIconUrl: () => null,
          });
        },
      });

    await activateExplorer();
    expect(icons.fileIconUrl("index.ts")).toBe("icon:typescript");
    expect(icons.snapshot().resolverIds).toEqual(["explorer.catalogue"]);

    await runtime.deactivate(explorerPlugin.id);
    expect(runtime.platformCapability("ui.file-icons")).toBe(icons);
    expect(icons.fileIconUrl("index.ts")).toBe(fallback);
    expect(icons.snapshot().resolverIds).toEqual([]);

    await activateExplorer();
    expect(runtime.platformCapability("ui.file-icons")).toBe(icons);
    expect(icons.snapshot().resolverIds).toEqual(["explorer.catalogue"]);
    expect(icons.fileIconUrl("index.ts")).toBe("icon:typescript");
    expect(runtime.lifecycleDiagnostics(iconsPlugin.id).successfulActivations).toBe(
      1,
    );
  });
});
