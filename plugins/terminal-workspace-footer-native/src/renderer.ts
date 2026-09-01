import type { PluginModule } from "@termco/kernel";
import { TERMINAL_WORKSPACE_FOOTER_SERVICE, type TerminalWorkspaceFooterCapability } from "@termco/terminal-base";
import {
  UI_WORKSPACE_COMPOSER_SERVICE,
  UI_WORKSPACE_FOOTER_SERVICE,
  type UiWorkspaceComposerCapability,
  type UiWorkspaceFooterRegistry,
} from "@termco/ui-workspace-base";
import { WORKSPACE_ENVIRONMENT_SERVICE, type WorkspaceEnvironmentCapability } from "@termco/workspace-base";

const plugin: PluginModule = {
  inject: [
    TERMINAL_WORKSPACE_FOOTER_SERVICE,
    UI_WORKSPACE_COMPOSER_SERVICE,
    WORKSPACE_ENVIRONMENT_SERVICE,
    UI_WORKSPACE_FOOTER_SERVICE,
  ],
  async activate(context) {
    const footer = context
      .get<TerminalWorkspaceFooterCapability>("terminal.workspace-footer")
      .create(
        context.get<UiWorkspaceComposerCapability>("ui.workspace-composer"),
        context.get<WorkspaceEnvironmentCapability>("workspace.environment"),
      );
    await context.effect(() =>
      context
        .get<UiWorkspaceFooterRegistry>(UI_WORKSPACE_FOOTER_SERVICE)
        .register(footer, {
          pluginId: "terminal-workspace-footer-native",
          generation: context.generation,
          key: footer.id,
        }),
    );
    const host = typeof window === "undefined"
      ? null
      : window as unknown as {
          __termco?: { e2e?: boolean };
          __termcoE2E?: Record<string, unknown>;
        };
    if (!host?.__termco?.e2e) return;
    const footerId = () => footer.id;
    const seam = (host.__termcoE2E ??= {});
    seam.terminalWorkspaceFooterId = footerId;
    return () => {
      if (seam.terminalWorkspaceFooterId === footerId) {
        delete seam.terminalWorkspaceFooterId;
      }
    };
  },
};

export default plugin;
