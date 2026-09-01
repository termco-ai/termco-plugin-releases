import { GIT_REPOSITORY_SERVICE } from "@termco/git-base";
import { CapabilityRuntime } from "@termco/kernel";
import {
  WORKFLOWS_LIBRARY_SERVICE,
  type WorkflowsLibraryCapability,
} from "@termco/workflows-base";
import { describe, expect, it } from "vitest";
import plugin from "./index";

function manifest(id: string) {
  return {
    schemaVersion: 3,
    id,
    name: id,
    description: id,
    category: "Test",
    version: "1.0.0",
    entrypoints: { renderer: "src/index.ts" },
    dependencies: {},
  };
}

describe("workflows plugin feature granularity", () => {
  it("keeps the library active while Git contributions leave and return", async () => {
    const workflows = manifest("workflows-native");
    const git = manifest("git-native");
    const runtime = new CapabilityRuntime(
      {
        profileId: "test.workflows",
        plugins: [workflows, git].map((entry) => ({
          id: entry.id,
          manifest: entry,
          source: {
            type: "local",
            module: entry.id,
            location: entry.id,
            integrity: entry.id,
          },
        })),
        activationOrder: [workflows.id, git.id],
      } as never,
    );

    await runtime.activate(workflows.id, plugin);
    const library = runtime.platformCapability<WorkflowsLibraryCapability>(
      WORKFLOWS_LIBRARY_SERVICE,
    );
    expect(runtime.inspect()).toContainEqual({
      pluginId: workflows.id,
      state: "active",
    });
    expect(library.get("git-status")).toBeUndefined();

    await runtime.activate(git.id, {
      activate: (context) =>
        context.provide(GIT_REPOSITORY_SERVICE, {}),
    });
    expect(library.get("git-status")).toBeDefined();
    expect(runtime.inspectFeatures()).toContainEqual(
      expect.objectContaining({
        pluginId: workflows.id,
        featureId: "git-contributions",
        state: "active",
      }),
    );

    await runtime.deactivate(git.id);
    expect(library.get("git-status")).toBeUndefined();
    expect(runtime.inspect()).toContainEqual({
      pluginId: workflows.id,
      state: "active",
    });
    expect(runtime.lifecycleDiagnostics(workflows.id).successfulActivations).toBe(1);
  });
});
