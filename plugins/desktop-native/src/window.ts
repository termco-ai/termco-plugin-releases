import type {
  DesktopWindowCapability,
  DesktopWindowControlCapability,
  DesktopWindowEventName,
} from "@termco/desktop-base";

export interface RendererWindowCaller {
  senderWebContentsId: number;
  windowId?: number;
  windowLabel?: string;
}

interface RendererWindowSubscriber extends RendererWindowCaller {
  eventSink: (payload: unknown) => void;
}

interface DesktopWindowTarget {
  show(): void;
  hide(): void;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  isMaximized(): boolean;
  close(): void;
  destroy(): void;
  setTitle(title: string): void;
  focus(): void;
  isFocused(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface MainDesktopWindowControl {
  show(caller: RendererWindowCaller): Promise<void>;
  hide(caller: RendererWindowCaller): Promise<void>;
  minimize(caller: RendererWindowCaller): Promise<void>;
  maximize(caller: RendererWindowCaller): Promise<void>;
  unmaximize(caller: RendererWindowCaller): Promise<void>;
  toggleMaximize(caller: RendererWindowCaller): Promise<void>;
  isMaximized(caller: RendererWindowCaller): Promise<boolean>;
  close(caller: RendererWindowCaller): Promise<void>;
  destroy(caller: RendererWindowCaller): Promise<void>;
  setTitle(title: string, caller: RendererWindowCaller): Promise<void>;
  focus(caller: RendererWindowCaller): Promise<void>;
  isFocused(caller: RendererWindowCaller): Promise<boolean>;
  startDragging(caller: RendererWindowCaller): Promise<void>;
  subscribe(
    event: DesktopWindowEventName,
    caller: RendererWindowSubscriber,
  ): () => void;
}

export function createDesktopWindowControlCapability(
  resolveWindow: (caller: RendererWindowCaller) => DesktopWindowTarget | null,
  e2e: boolean,
): MainDesktopWindowControl {
  const target = (caller: RendererWindowCaller): DesktopWindowTarget => {
    const resolved = resolveWindow(caller);
    if (resolved) return resolved;
    throw new Error(
      `desktop.window could not resolve renderer window "${caller.windowLabel ?? caller.windowId ?? "unknown"}"`,
    );
  };
  return {
    async show(caller) {
      const window = target(caller);
      if (!e2e) window.show();
    },
    async hide(caller) {
      target(caller).hide();
    },
    async minimize(caller) {
      target(caller).minimize();
    },
    async maximize(caller) {
      target(caller).maximize();
    },
    async unmaximize(caller) {
      target(caller).unmaximize();
    },
    async toggleMaximize(caller) {
      const window = target(caller);
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    },
    async isMaximized(caller) {
      return target(caller).isMaximized();
    },
    async close(caller) {
      target(caller).close();
    },
    async destroy(caller) {
      target(caller).destroy();
    },
    async setTitle(title, caller) {
      target(caller).setTitle(title);
    },
    async focus(caller) {
      target(caller).focus();
    },
    async isFocused(caller) {
      return target(caller).isFocused();
    },
    async startDragging(caller) {
      // Native dragging is provided by the shell's data-drag-region CSS. Still
      // resolve the caller so an invalid renderer cannot silently succeed.
      target(caller);
    },
    subscribe(event, caller) {
      const window = target(caller);
      if (typeof caller.eventSink !== "function") {
        throw new Error("desktop.window subscription requires an event sink");
      }
      const listeners: Array<[
        event: string,
        listener: (...args: unknown[]) => void,
      ]> =
        event === "close-requested"
          ? [["close", () => caller.eventSink(null)]]
          : event === "focus-changed"
            ? [
                ["focus", () => caller.eventSink(true)],
                ["blur", () => caller.eventSink(false)],
              ]
            : [["resize", () => caller.eventSink(null)]];
      for (const [name, listener] of listeners) window.on(name, listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        for (const [name, listener] of listeners) {
          window.removeListener(name, listener);
        }
      };
    },
  };
}

export function createDesktopWindowCapability(
  control: DesktopWindowControlCapability,
): DesktopWindowCapability {
  return {
    show: () => control.show(),
    hide: () => control.hide(),
    minimize: () => control.minimize(),
    maximize: () => control.maximize(),
    unmaximize: () => control.unmaximize(),
    toggleMaximize: () => control.toggleMaximize(),
    isMaximized: () => control.isMaximized(),
    close: () => control.close(),
    setTitle: (title) => control.setTitle(title),
    focus: () => control.focus(),
    isFocused: () => control.isFocused(),
    startDragging: () => control.startDragging(),
    onCloseRequested(listener) {
      return control.subscribe("close-requested", () => {
        let prevented = false;
        const event = {
          preventDefault() {
            prevented = true;
          },
          isPreventDefault() {
            return prevented;
          },
        };
        void listener(event);
        if (!prevented) void control.destroy();
      });
    },
    onFocusChanged(listener) {
      return control.subscribe("focus-changed", (payload) => {
        listener(payload === true);
      });
    },
    onResized(listener) {
      return control.subscribe("resized", () => listener());
    },
  };
}
