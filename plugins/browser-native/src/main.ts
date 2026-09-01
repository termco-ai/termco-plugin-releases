import { BrowserWindow, webContents } from "electron";
import type {
  BrowserAutomationCapability,
  BrowserCapabilityCaller,
} from "@termco/browser-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import {
  browserAiCommandNames,
  installBrowserAiHandlers,
  invokeBrowserAiCommand,
} from "./aiControl";
import { configureBrowserEvents } from "./events";
import { normalizeRect, type ChordSpec, type Rect } from "./pure";
import {
  createView,
  destroyAllViews,
  destroyView,
  getEntry,
  liveBrowserViews,
  setInterceptChords,
} from "./registry";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";

const BASE_COMMANDS = [
  "browser_create",
  "browser_destroy",
  "browser_set_bounds",
  "browser_set_visible",
  "browser_load_url",
  "browser_go_back",
  "browser_go_forward",
  "browser_reload",
  "browser_stop",
  "browser_get_state",
  "browser_focus",
  "browser_focus_host",
  "browser_set_intercept_chords",
] as const;

function entry(caller: BrowserCapabilityCaller, tabId: number) {
  const value = getEntry(caller.windowLabel ?? "main", tabId);
  if (!value || value.view.webContents.isDestroyed()) return null;
  return value;
}

async function invokeBase(
  command: string,
  payload: Record<string, unknown>,
  caller: BrowserCapabilityCaller,
): Promise<unknown> {
  const tabId = payload.tabId as number;
  switch (command) {
    case "browser_create": {
      const win = caller.windowId == null ? null : BrowserWindow.fromId(caller.windowId);
      if (!win || win.isDestroyed()) return null;
      return createView(
        win,
        caller.windowLabel ?? "main",
        tabId,
        (payload.url as string) ?? "",
        normalizeRect(payload.bounds as Rect),
      );
    }
    case "browser_destroy":
      destroyView(caller.windowLabel ?? "main", tabId);
      return null;
    case "browser_set_bounds":
      entry(caller, tabId)?.view.setBounds(normalizeRect(payload.bounds as Rect));
      return null;
    case "browser_set_visible":
      entry(caller, tabId)?.view.setVisible(Boolean(payload.visible));
      return null;
    case "browser_load_url": {
      const current = entry(caller, tabId);
      if (current) void current.view.webContents.loadURL(payload.url as string).catch(() => {});
      return null;
    }
    case "browser_go_back":
      entry(caller, tabId)?.view.webContents.navigationHistory.goBack();
      return null;
    case "browser_go_forward":
      entry(caller, tabId)?.view.webContents.navigationHistory.goForward();
      return null;
    case "browser_reload":
      entry(caller, tabId)?.view.webContents.reload();
      return null;
    case "browser_stop":
      entry(caller, tabId)?.view.webContents.stop();
      return null;
    case "browser_get_state":
      return getEntry(caller.windowLabel ?? "main", tabId)?.state ?? null;
    case "browser_focus":
      entry(caller, tabId)?.view.webContents.focus();
      return null;
    case "browser_focus_host": {
      const sender = webContents.fromId(caller.senderWebContentsId);
      if (sender && !sender.isDestroyed()) sender.focus();
      return null;
    }
    case "browser_set_intercept_chords":
      setInterceptChords((payload.chords as ChordSpec[]) ?? []);
      return null;
    default:
      throw new Error(`unknown browser command: ${command}`);
  }
}

let active: BrowserAutomationCapability | null = null;

export function browserCapabilityActive(): boolean {
  return active !== null;
}

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
  ],
  async activate(context) {
    await context.effect(() => {
      configureBrowserEvents(
        context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      );
      return () => configureBrowserEvents(null);
    });
    await context.effect(installBrowserAiHandlers);
    const aiCommands = new Set(browserAiCommandNames());
    const commands = [...BASE_COMMANDS, ...aiCommands];
    const capability: BrowserAutomationCapability = {
      commands: () => commands,
      invoke(command, payload, caller) {
        if (!caller) throw new Error("browser.automation requires renderer caller identity");
        return aiCommands.has(command)
          ? invokeBrowserAiCommand(command, payload, caller)
          : invokeBase(command, payload, caller);
      },
      liveResources: liveBrowserViews,
    };
    active = capability;
    await context.effect(() => () => {
      destroyAllViews();
      if (active === capability) active = null;
    });
    context.provide("browser.automation", capability);
  },
  replacementImpact() {
    const resources = active?.liveResources() ?? [];
    return resources.length === 0
      ? []
      : [
          {
            capability: "browser.automation",
            resourceLabel: "embedded browser sessions",
            resources,
          },
        ];
  },
};

export default plugin;
