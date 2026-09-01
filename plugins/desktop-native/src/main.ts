import { app, BrowserWindow, clipboard, Notification, shell } from "electron";
import { sep } from "node:path";
import type {
  ApplicationPathsCapability,
} from "@termco/application-base";
import type {
  DesktopIntegrationCapability,
  DesktopWindowControlCapability,
} from "@termco/desktop-base";
import type { PluginModule } from "@termco/kernel";
import { normalizeLogLevel } from "./log";
import {
  createDesktopWindowControlCapability,
  type RendererWindowCaller,
} from "./window";

let notificationSupported = false;

function showNotification(title: string, body: string): void {
  try {
    if (!notificationSupported) {
      if (!Notification.isSupported()) return;
      notificationSupported = true;
    }
    new Notification({ title, body }).show();
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: notification boundary failures must not escape callers
    console.warn("[desktop-native] notification failed", error);
  }
}

const plugin: PluginModule = {
  activate(context) {
    const capability: DesktopIntegrationCapability = {
      async openUrl(url) {
        await shell.openExternal(url);
      },
      async openPath(path) {
        await shell.openPath(path);
      },
      revealItem: (path) => shell.showItemInFolder(path),
      relaunch() {
        app.relaunch();
        app.exit(0);
      },
      exit: (code) => app.exit(code),
      setAutostart: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled }),
      autostartEnabled: () => app.getLoginItemSettings().openAtLogin,
      readClipboardText: () => clipboard.readText(),
      writeClipboardText: (text) => clipboard.writeText(text),
      notify: showNotification,
      log(level, message) {
        const normalized = normalizeLogLevel(level);
        // biome-ignore lint/suspicious/noConsole: canonical main-process logger sink
        console[normalized === "error" ? "error" : normalized === "warn" ? "warn" : "log"](`[renderer] ${message}`);
      },
      subscribeDragDrop() {
        throw new Error("desktop drag/drop subscriptions are renderer-local");
      },
    };
    context.provide("desktop.integration", capability);
    const windowControl = createDesktopWindowControlCapability(
      (caller: RendererWindowCaller) =>
        caller.windowId === undefined
          ? null
          : BrowserWindow.fromId(caller.windowId),
      process.env.TERMCO_E2E === "1",
    );
    context.provide<DesktopWindowControlCapability>(
      "desktop.window-control",
      windowControl as unknown as DesktopWindowControlCapability,
    );
    const applicationPaths: ApplicationPathsCapability = {
      getPaths: async () => ({
        appConfigDir: app.getPath("userData"),
        pathSeparator: sep,
      }),
    };
    context.provide("application.paths", applicationPaths);
  },
};

export default plugin;
