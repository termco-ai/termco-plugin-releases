import {
  APPLICATION_PATHS_SERVICE,
} from "@termco/application-base";
import {
  DESKTOP_INTEGRATION_SERVICE,
  DESKTOP_WINDOW_CONTROL_SERVICE,
  type DesktopDragDropEvent,
  type DesktopIntegrationCapability,
  type DesktopWindowCapability,
  type DesktopWindowControlCapability,
  type DesktopWindowEventName,
} from "@termco/desktop-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessRemoteDispose,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";
import { createDesktopWindowCapability } from "./window";

interface RendererDesktopWindowControl
  extends DesktopWindowControlCapability {
  dispose(): Promise<void>;
}

interface RendererDesktopIntegration extends DesktopIntegrationCapability {
  dispose(): void;
}

export function createRendererDesktopIntegration(
  transport: ProcessTransport,
): RendererDesktopIntegration {
  const remote = createProcessServiceProxy<DesktopIntegrationCapability>(
    DESKTOP_INTEGRATION_SERVICE,
    transport,
  );
  const subscriptions = new Set<() => void>();
  return {
    openUrl: remote.openUrl,
    openPath: remote.openPath,
    revealItem: remote.revealItem,
    relaunch: remote.relaunch,
    exit: remote.exit,
    setAutostart: remote.setAutostart,
    autostartEnabled: remote.autostartEnabled,
    readClipboardText: remote.readClipboardText,
    writeClipboardText: remote.writeClipboardText,
    notify: remote.notify,
    log: remote.log,
    subscribeDragDrop(listener: (event: DesktopDragDropEvent) => void) {
      if (!transport.subscribeHostEvent) {
        throw new Error("process transport does not support host events");
      }
      const detach = transport.subscribeHostEvent("drag-drop", listener);
      let subscribed = true;
      const dispose = () => {
        if (!subscribed) return;
        subscribed = false;
        subscriptions.delete(dispose);
        detach();
      };
      subscriptions.add(dispose);
      return dispose;
    },
    dispose() {
      for (const subscription of [...subscriptions]) subscription();
    },
  };
}

export function createRendererDesktopWindowControl(
  transport: ProcessTransport,
): RendererDesktopWindowControl {
  type SubscriptionCleanup = () => Promise<void>;
  const subscriptions = new Set<SubscriptionCleanup>();
  const pendingCleanup = new Set<Promise<void>>();
  const call = <T>(method: string, args: readonly unknown[] = []) =>
    transport.call(DESKTOP_WINDOW_CONTROL_SERVICE, method, args, {
      caller: true,
    }) as Promise<T>;

  return {
    show: () => call("show"),
    hide: () => call("hide"),
    minimize: () => call("minimize"),
    maximize: () => call("maximize"),
    unmaximize: () => call("unmaximize"),
    toggleMaximize: () => call("toggleMaximize"),
    isMaximized: () => call<boolean>("isMaximized"),
    close: () => call("close"),
    destroy: () => call("destroy"),
    setTitle: (title) => call("setTitle", [title]),
    focus: () => call("focus"),
    isFocused: () => call<boolean>("isFocused"),
    startDragging: () => call("startDragging"),
    subscribe(
      event: DesktopWindowEventName,
      listener: (payload: unknown) => void,
    ) {
      const channel = transport.registerChannel(listener);
      const remote = transport.call(
        DESKTOP_WINDOW_CONTROL_SERVICE,
        "subscribe",
        [event],
        { caller: true, callerFields: { eventSink: channel } },
      ) as Promise<ProcessRemoteDispose>;
      let cleanupPromise: Promise<void> | undefined;
      const cleanup: SubscriptionCleanup = () => {
        if (cleanupPromise) return cleanupPromise;
        subscriptions.delete(cleanup);
        transport.releaseChannel(channel);
        cleanupPromise = remote.then(
          (handle) => transport.releaseRemote(handle),
          () => undefined,
        );
        pendingCleanup.add(cleanupPromise);
        const trackedCleanup = cleanupPromise;
        void trackedCleanup.then(
          () => pendingCleanup.delete(trackedCleanup),
          () => pendingCleanup.delete(trackedCleanup),
        );
        return cleanupPromise;
      };
      subscriptions.add(cleanup);
      void remote.catch(() => cleanup());
      return () => {
        void cleanup().catch(() => {});
      };
    },
    async dispose() {
      await Promise.all([...subscriptions].map((cleanup) => cleanup()));
      await Promise.all([...pendingCleanup]);
    },
  };
}

const plugin: PluginModule = {
  inject: [processTransportService],
  async activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    const control = createRendererDesktopWindowControl(transport);
    const desktop = createRendererDesktopIntegration(transport);
    await context.effect(() => () => control.dispose());
    await context.effect(() => () => desktop.dispose());
    context.provide(DESKTOP_WINDOW_CONTROL_SERVICE, control);
    context.provide(DESKTOP_INTEGRATION_SERVICE, desktop);
    context.provide(
      APPLICATION_PATHS_SERVICE,
      createProcessServiceProxy<Services[typeof APPLICATION_PATHS_SERVICE]>(
        APPLICATION_PATHS_SERVICE,
        transport,
      ),
    );
    context.provide<DesktopWindowCapability>(
      "desktop.window",
      createDesktopWindowCapability(control),
    );
  },
};

export default plugin;
