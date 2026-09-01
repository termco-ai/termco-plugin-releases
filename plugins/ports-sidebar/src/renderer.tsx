import { DESKTOP_INTEGRATION_SERVICE, type DesktopIntegrationCapability } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import { SSH_CLIENT_SERVICE, type SshClientCapability } from "@termco/ssh-base";
import {
  UI_SIDEBAR_VIEWS_SERVICE,
  type UiSidebarViewContribution,
  type UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons";
import { createPortsBadge, createPortsPanel } from "./PortsPanel";

const plugin: PluginModule = {
  inject: [
    SSH_CLIENT_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
  ],
  async activate(context) {
    const ssh = context.get<SshClientCapability>("ssh.client");
    const desktop = context.get<DesktopIntegrationCapability>(
      "desktop.integration",
    );
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    const contribution: UiSidebarViewContribution = {
      id: "ports",
      label: "Ports",
      description: "Manage port forwards on the active SSH workspace.",
      order: 40,
      icon: ArrowDataTransferHorizontalIcon,
      useBadge: createPortsBadge(ssh, events),
      Component: createPortsPanel(ssh, desktop, events),
    };
    await context.effect(() =>
      context
        .get<UiSidebarViewRegistry>(UI_SIDEBAR_VIEWS_SERVICE)
        .register(contribution, { pluginId: "ports-sidebar", generation: context.generation, key: "ports" }),
    );
  },
};

export default plugin;
