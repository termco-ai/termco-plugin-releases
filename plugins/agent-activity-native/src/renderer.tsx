import type {
  AgentActivityControlCapability,
  AgentActivityEventRegistry,
  AgentActivityLocalNotification,
  AgentActivityTerminalSignal,
} from "@termco/agents-base";
import type {
  DesktopIntegrationCapability,
  DesktopWindowCapability,
} from "@termco/desktop-base";
import { createLiveOptionalFacade, type PluginModule } from "@termco/kernel";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import {
  ChatGptIcon,
  ClaudeIcon,
  GoogleGeminiIcon,
  RoboticIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { toast } from "sonner";
import { AgentActivityStore } from "./activity";
import { createActivityEventRegistry } from "./activityEventRegistry";
import { AGENTS_ACTIVITY_EVENTS_SERVICE } from "@termco/agents-base";
import {
  DESKTOP_INTEGRATION_SERVICE,
  DESKTOP_WINDOW_SERVICE,
} from "@termco/desktop-base";
import { SHORTCUTS_REGISTRY_SERVICE } from "@termco/shortcuts-base";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";

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

function displayAgent(agent: string): string {
  const labels: Record<string, string> = {
    claude: "Claude Code",
    codex: "Codex",
    gemini: "Gemini",
    termco: "Termco",
  };
  return (
    labels[agent.toLowerCase()] ??
    agent.charAt(0).toUpperCase() + agent.slice(1)
  );
}

function iconFor(agent: string): IconSvgElement {
  const normalized = agent.toLowerCase();
  return normalized.includes("claude")
    ? ClaudeIcon
    : normalized.includes("gemini")
      ? GoogleGeminiIcon
      : normalized.includes("codex") ||
          normalized.includes("gpt") ||
          normalized.includes("openai")
        ? ChatGptIcon
        : RoboticIcon;
}

function AgentIcon({ agent }: { agent: string }) {
  if (agent.toLowerCase().includes("termco")) {
    return (
      <img
        src="./logo.png"
        alt=""
        width={18}
        height={18}
        style={{ width: 18, height: 18 }}
      />
    );
  }
  return <HugeiconsIcon icon={iconFor(agent)} size={18} strokeWidth={1.75} />;
}

const plugin: PluginModule = {
  inject: [
    DESKTOP_WINDOW_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
  ],
  optionalInject: [SHORTCUTS_REGISTRY_SERVICE],
  async activate(context) {
    const activity = new AgentActivityStore();
    const reactions = createActivityEventRegistry();
    context.provide<AgentActivityEventRegistry>(
      AGENTS_ACTIVITY_EVENTS_SERVICE,
      reactions,
    );
    await context.effect(() => () => activity.dispose());
    const desktopWindow =
      context.get<DesktopWindowCapability>("desktop.window");
    const desktop =
      context.get<DesktopIntegrationCapability>("desktop.integration");
    const preferences =
      context.get<PreferencesCapability>("settings.preferences");
    const shortcutsFacade = createLiveOptionalFacade(
      context.observe<ShortcutRegistryCapability>(SHORTCUTS_REGISTRY_SERVICE),
      EMPTY_SHORTCUTS,
    );
    await context.effect(() => shortcutsFacade.dispose);
    const shortcuts = shortcutsFacade.value;
    let focused =
      typeof document === "undefined" ? true : document.hasFocus();
    let notificationsEnabled =
      (await preferences.get<boolean>("agentNotifications")) ?? true;

    const showToast = (input: {
      agent: string;
      title: string;
      body?: string;
      activate(): void;
    }) => {
      const hint = shortcuts
        .format(shortcuts.bindings("agent.focusAttention")[0])
        .join(" ");
      toast(input.title, {
        description: hint ? (
          <span className="flex items-center gap-1.5">
            {input.body ? (
              <span className="min-w-0 truncate">{input.body}</span>
            ) : null}
            <kbd className="ml-auto shrink-0 rounded border border-border/60 bg-muted/60 px-1 py-px text-xs font-medium text-muted-foreground">
              {hint}
            </kbd>
          </span>
        ) : (
          input.body
        ),
        icon: <AgentIcon agent={input.agent} />,
        action: { label: "Open", onClick: input.activate },
        duration: 6000,
      });
    };
    const notifyTerminal = (
      signal: Extract<
        AgentActivityTerminalSignal,
        { kind: "attention" | "finished" }
      >,
    ) => {
      if (!notificationsEnabled) return;
      const session = activity.session(signal.leafId);
      if (!session) return;
      const name = displayAgent(session.agent);
      const title =
        signal.kind === "attention"
          ? `${name} needs your input`
          : `${name} finished`;
      if (focused && signal.visible) return;
      activity.pushNotification({
        source: "terminal",
        agent: session.agent,
        kind: signal.kind,
        tabId: session.tabId,
        leafId: signal.leafId,
      });
      if (!focused) {
        desktop.notify(title, signal.body ?? session.agent);
        return;
      }
      if (signal.kind !== "attention") return;
      showToast({
        agent: session.agent,
        title,
        body: signal.body,
        activate: () => {
          signal.activate();
          void desktopWindow.focus();
        },
      });
    };
    const notifyLocal = (notification: AgentActivityLocalNotification) => {
      if (!notificationsEnabled || (focused && notification.visible)) return;
      activity.pushNotification({
        source: "local",
        agent: notification.agent,
        kind: notification.kind,
        tabId: 0,
        leafId: 0,
      });
      if (!focused) {
        desktop.notify(
          notification.title,
          notification.body ?? notification.agent,
        );
        return;
      }
      showToast({
        agent: notification.agent,
        title: notification.title,
        body: notification.body,
        activate: notification.activate,
      });
    };

    await context.effect(() =>
      desktopWindow.onFocusChanged((next) => {
        focused = next;
      }),
    );
    await context.effect(() =>
      preferences.subscribe((key, value) => {
        if (key === "agentNotifications" && typeof value === "boolean") {
          notificationsEnabled = value;
        }
      }),
    );
    const terminalSignal = (signal: AgentActivityTerminalSignal) => {
      if (signal.kind === "started") {
        activity.start(signal.leafId, signal.tabId, signal.agent);
        return;
      }
      if (signal.kind === "working") {
        activity.setStatus(signal.leafId, "working");
        return;
      }
      if (signal.kind === "attention" || signal.kind === "finished") {
        activity.setStatus(signal.leafId, "waiting");
        notifyTerminal(signal);
        if (signal.kind === "finished") {
          activity.emit({ kind: "finished", leafId: signal.leafId });
          for (const reaction of reactions.snapshot()) {
            reaction.finished?.(signal.leafId);
          }
        }
        return;
      }
      activity.finish(signal.leafId);
      activity.emit({ kind: "exited", leafId: signal.leafId });
      for (const reaction of reactions.snapshot()) {
        reaction.exited?.(signal.leafId);
      }
    };

    const control: AgentActivityControlCapability = {
      terminalSignal,
      setLocalAgent: activity.setLocalAgent,
      notifyLocal,
    };
    context.provide("agents.activity", activity);
    context.provide("agents.activity-control", control);
  },
};

export default plugin;
