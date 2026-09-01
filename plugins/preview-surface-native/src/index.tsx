import { AI_LIVE_CONTRIBUTIONS_SERVICE, type AiLiveContributionCapability } from "@termco/ai-live-base";
import {
  BROWSER_AUTOMATION_SERVICE,
  type BrowserAutomationCapability,
  type BrowserTabsCapability,
} from "@termco/browser-base";
import { DESKTOP_INTEGRATION_SERVICE, type DesktopIntegrationCapability } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { createLiveOptionalFacade, type PluginModule } from "@termco/kernel";
import { SHORTCUTS_REGISTRY_SERVICE, type ShortcutRegistryCapability } from "@termco/shortcuts-base";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandItem,
  type UiCommandRegistry,
} from "@termco/ui-commands-base";
import {
  UI_TABS_KINDS_SERVICE,
  type UiTabKindContribution,
  type UiTabKindRegistry,
} from "@termco/ui-tabs-base";
import { WORKSPACE_TABS_SERVICE, type WorkspaceTabsCapability } from "@termco/workspace-base";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { BrowserClient } from "./browser";
import { chordsFromSnapshot } from "./model";
import { createPreviewSurface } from "./renderer";
import { createBrowserTabsController } from "./tabs";
import { contributeBrowserAiLive } from "./aiLive";
import { installTerminalPreviewNavigation } from "./terminalPreviewNavigation";

const EMPTY_SHORTCUTS_SNAPSHOT = {
  revision: 0,
  groups: [],
  shortcuts: [],
  overrides: {},
} as const;
const EMPTY_SHORTCUTS: ShortcutRegistryCapability = {
  snapshot: () => EMPTY_SHORTCUTS_SNAPSHOT,
  subscribe: () => () => {},
  bindings: () => [],
  match: () => false,
  format: () => [],
  useHandlers: () => {},
  setBindings: async () => {},
  reset: async () => {},
  resetAll: async () => {},
};

const plugin: PluginModule = {
  inject: [
    BROWSER_AUTOMATION_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    WORKSPACE_TABS_SERVICE,
    AI_LIVE_CONTRIBUTIONS_SERVICE,
    UI_TABS_KINDS_SERVICE,
    UI_COMMANDS_SERVICE,
  ],
  optionalInject: [SHORTCUTS_REGISTRY_SERVICE],
  async activate(context) {
    const automation = context.get<BrowserAutomationCapability>("browser.automation");
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    const shortcutsFacade = createLiveOptionalFacade(
      context.observe<ShortcutRegistryCapability>(SHORTCUTS_REGISTRY_SERVICE),
      EMPTY_SHORTCUTS,
    );
    await context.effect(() => shortcutsFacade.dispose);
    const shortcuts = shortcutsFacade.value;
    const desktop = context.get<DesktopIntegrationCapability>("desktop.integration");
    const client = new BrowserClient(automation, events);
    await context.effect(() => () => client.dispose());
    const tabs = createBrowserTabsController(
      context.get<WorkspaceTabsCapability>("workspace.tabs"),
    );
    await context.effect(() => installTerminalPreviewNavigation(events, tabs));
    const syncChords = () => void client.invoke("browser_set_intercept_chords", { chords: chordsFromSnapshot(shortcuts.snapshot()) }).catch(() => {});
    await context.effect(() => {
      syncChords();
      return () => {
        void client
          .invoke("browser_set_intercept_chords", { chords: [] })
          .catch(() => {});
      };
    });
    await context.effect(() => shortcuts.subscribe(syncChords));
    await context.effect(() =>
      client.onOpenUrl(events, ({ url }) => {
        tabs.open(url);
      }),
    );
    await context.effect(() =>
      client.onKey(events, (event) => {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: event.key,
          ctrlKey: event.control,
          metaKey: event.meta,
          shiftKey: event.shift,
          altKey: event.alt,
          bubbles: true,
          cancelable: true,
        }));
      }),
    );
    const surface: UiTabKindContribution = {
      id: "preview",
      label: "Web Preview",
      description: "Embedded browser with shared sessions, navigation, debugging, and AI page capture.",
      kinds: ["preview"],
      receivesVisibility: true,
      Component: createPreviewSurface(client, desktop),
    };
    const command: UiCommandItem = {
      id: "tab.newPreview",
      title: "New web preview",
      description: "Open an embedded browser tab.",
      group: "Tabs",
      keywords: ["browser", "web", "localhost", "preview"],
      order: 30,
      shortcutId: "tab.newPreview",
      icon: Globe02Icon,
      run: () => { tabs.open(""); },
    };
    context.provide("browser.tabs", tabs satisfies BrowserTabsCapability);
    await context.effect(() =>
      contributeBrowserAiLive(
        context.get<AiLiveContributionCapability>("ai.live-contributions"),
        tabs,
      ),
    );
    await context.effect(() =>
      context.get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE).register(surface, {
        pluginId: "preview-surface-native",
        generation: context.generation,
        key: surface.id,
      }),
    );
    await context.effect(() =>
      context.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(command, {
        pluginId: "preview-surface-native",
        generation: context.generation,
        key: "preview",
      }),
    );
  },
};

export default plugin;
