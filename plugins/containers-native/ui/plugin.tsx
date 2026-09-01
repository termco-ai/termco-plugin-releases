import type { BrowserTabsCapability } from "@termco/browser-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type {
  UiSidebarNavigationCapability,
  UiSidebarViewContribution,
  UiSidebarViewRegistry,
  UiSidebarViewProps,
} from "@termco/ui-sidebar-base";
import type {
  UiTabKindContribution,
  UiTabKindRegistry,
  UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import type { WorkspaceExecutionCapability, WorkspaceTabsCapability } from "@termco/workspace-base";
import ui from "@termco/ui";
import { ContainerIcon } from "@hugeicons/core-free-icons";
import { ContainerDetailStackView, ContainersPanel, useActiveContainerTab } from ".";
import {
  configureContainerIntegrations,
  setContainerTerminalRunner,
} from "./lib/integrations";
import { configureContainersNative, setContainersWorkspace } from "./lib/native";
import { BROWSER_TABS_SERVICE } from "@termco/browser-base";
import { CONTAINERS_RUNTIME_SERVICE } from "@termco/containers-base";
import { WORKSPACE_EXECUTION_SERVICE, WORKSPACE_TABS_SERVICE } from "@termco/workspace-base";
import { UI_SIDEBAR_VIEWS_SERVICE } from "@termco/ui-sidebar-base";
import { UI_SIDEBAR_NAVIGATION_SERVICE } from "@termco/ui-sidebar-base";
import { UI_SETTINGS_VIEW_SERVICE, type UiSettingsViewCapability } from "@termco/ui-settings-base";
import { UI_AGENTS_VIEW_SERVICE, type UiAgentsViewCapability } from "@termco/ui-agents-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";
import { createContainersOnboardingContribution } from "./onboarding";

const { useEffect } = ui.React;

function Panel(props: UiSidebarViewProps) {
  setContainersWorkspace(props.workspace);
  setContainerTerminalRunner(props.runInNewTerminal);
  return <div data-onboarding-target="containers.panel" className="h-full"><ui.TooltipProvider><ContainersPanel /></ui.TooltipProvider></div>;
}

function Surface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
  setContainersWorkspace(runtime.workspace);
  setContainerTerminalRunner(runtime.runInNewTerminal);
  const setActiveKey = useActiveContainerTab((state) => state.setActiveKey);
  useEffect(() => {
    const applicationActiveId = runtime.activeTabId();
    const active = runtime
      .allTabs()
      .find(
        (tab) => tab.id === applicationActiveId && tab.kind === "container",
      );
    const data = active?.data as { runtime?: string; containerId?: string } | undefined;
    setActiveKey(data?.runtime && data.containerId ? `${data.runtime}:${data.containerId}` : null);
  }, [activeId, runtime, setActiveKey]);
  if (!tabs.some((tab) => tab.kind === "container")) return null;
  return <ui.TooltipProvider><ContainerDetailStackView tabs={tabs} activeId={activeId} /></ui.TooltipProvider>;
}

const plugin: PluginModule = {
  inject: [
    processTransportService,
    WORKSPACE_EXECUTION_SERVICE,
    BROWSER_TABS_SERVICE,
    WORKSPACE_TABS_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
    UI_SIDEBAR_NAVIGATION_SERVICE,
    UI_SETTINGS_VIEW_SERVICE,
    UI_AGENTS_VIEW_SERVICE,
    UI_TABS_KINDS_SERVICE,
  ],
  optionalInject: [ONBOARDING_REGISTRY_SERVICE, ONBOARDING_RUNTIME_SERVICE],
  async activate(context) {
    const navigation = context.get<UiSidebarNavigationCapability>(
      UI_SIDEBAR_NAVIGATION_SERVICE,
    );
    contributeOnboarding(
      context,
      createContainersOnboardingContribution(
        navigation,
        context.get<UiSettingsViewCapability>(UI_SETTINGS_VIEW_SERVICE),
        context.get<UiAgentsViewCapability>(UI_AGENTS_VIEW_SERVICE),
      ),
      "Container management guidance",
    );
    context.feature(
      {
        id: "onboarding:containers-context",
        label: "Contextual Containers guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        let selected = navigation.snapshot().view === "containers";
        return navigation.subscribe(() => {
          const next = navigation.snapshot().view === "containers";
          if (next && !selected) {
            void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
              .suggest("containers-native.manage-runtime");
          }
          selected = next;
        });
      },
    );
    const transport = context.get<ProcessTransport>(processTransportService);
    const containers = createProcessServiceProxy<
      Services[typeof CONTAINERS_RUNTIME_SERVICE]
    >(CONTAINERS_RUNTIME_SERVICE, transport);
    context.provide(CONTAINERS_RUNTIME_SERVICE, containers);
    await context.effect(() => {
      configureContainersNative(containers);
      return () => configureContainersNative(null);
    });
    await context.effect(() => {
      configureContainerIntegrations({
        execution: context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
        browser: context.get<BrowserTabsCapability>("browser.tabs"),
        tabs: context.get<WorkspaceTabsCapability>("workspace.tabs"),
      });
      return () => {
        configureContainerIntegrations({ ssh: null, browser: null, tabs: null });
        setContainerTerminalRunner(null);
      };
    });
    const sidebar: UiSidebarViewContribution = {
      id: "containers",
      label: "Containers",
      description: "Inspect and control containers on the active local, WSL, or SSH workspace.",
      order: 30,
      icon: ContainerIcon,
      Component: Panel,
    };
    const surface: UiTabKindContribution = {
      id: "containers",
      label: "Container detail",
      description: "Container state, logs, inspect data, resource usage, ports, and actions.",
      kinds: ["container"],
      mountWhen: "whenOpen",
      Component: Surface,
    };
    await context.effect(() =>
      context
        .get<UiSidebarViewRegistry>("ui.sidebar.views")
        .register(sidebar, {
          pluginId: "containers-native",
          generation: context.generation,
          key: sidebar.id,
        }),
    );
    await context.effect(() =>
      context.get<UiTabKindRegistry>("ui.tabs.kinds").register(surface, {
        pluginId: "containers-native",
        generation: context.generation,
        key: surface.id,
      }),
    );
  },
};

export default plugin;
