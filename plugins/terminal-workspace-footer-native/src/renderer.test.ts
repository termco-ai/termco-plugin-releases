import type { TerminalWorkspaceFooterCapability } from "@termco/terminal-base";
import type {
  UiWorkspaceComposerCapability,
  UiWorkspaceFooterContribution,
  UiWorkspaceFooterRegistry,
} from "@termco/ui-workspace-base";
import type { WorkspaceEnvironmentCapability } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("terminal workspace footer integration", () => {
  it("registers the selected terminal factory and composer with exact ownership", async () => {
    const composer = {} as UiWorkspaceComposerCapability;
    const environment = {} as WorkspaceEnvironmentCapability;
    const footer: UiWorkspaceFooterContribution = {
      id: "terminal-block-input",
      Component: () => null,
    };
    const factory: TerminalWorkspaceFooterCapability = {
      create: vi.fn(() => footer),
    };
    const register = vi.fn(() => () => {});
    const registry = {
      register,
      snapshot: () => [],
      records: () => [],
      subscribe: () => () => {},
    } satisfies UiWorkspaceFooterRegistry;

    await plugin.activate({
      get(capability: string) {
        if (capability === "terminal.workspace-footer") return factory;
        if (capability === "ui.workspace-composer") return composer;
        if (capability === "workspace.environment") return environment;
        if (capability === "ui.workspace.footer") return registry;
        throw new Error(`unexpected capability: ${capability}`);
      },
      effect: async (install: () => () => void) => install(),
    } as never);

    expect(factory.create).toHaveBeenCalledWith(composer, environment);
    expect(register).toHaveBeenCalledWith(
      footer,
      {
        pluginId: "terminal-workspace-footer-native",
        key: "terminal-block-input",
      },
    );
  });
});
