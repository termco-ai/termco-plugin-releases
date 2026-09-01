import { describe, expect, it, vi } from "vitest";
import {
  createDesktopWindowCapability,
  createDesktopWindowControlCapability,
} from "./window";

const caller = {
  senderWebContentsId: 41,
  windowId: 7,
  windowLabel: "main",
};

function setup(e2e = false) {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const target = {
    show: vi.fn(),
    hide: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    close: vi.fn(),
    destroy: vi.fn(),
    setTitle: vi.fn(),
    focus: vi.fn(),
    isFocused: vi.fn(() => true),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(listener);
      handlers.set(event, listeners);
    }),
    removeListener: vi.fn(
      (event: string, listener: (...args: unknown[]) => void) => {
        handlers.get(event)?.delete(listener);
      },
    ),
  };
  const resolveWindow = vi.fn(() => target);
  const capability = createDesktopWindowControlCapability(resolveWindow, e2e);
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of handlers.get(event) ?? []) listener(...args);
  };
  return { capability, emit, resolveWindow, target };
}

describe("desktop.window provider", () => {
  it("targets the BrowserWindow belonging to the renderer caller", async () => {
    const { capability, resolveWindow, target } = setup();
    await capability.show(caller);
    await capability.minimize(caller);
    await capability.toggleMaximize(caller);
    await capability.setTitle("Project — src", caller);
    await capability.focus(caller);

    expect(resolveWindow).toHaveBeenCalledWith(caller);
    expect(target.show).toHaveBeenCalledOnce();
    expect(target.minimize).toHaveBeenCalledOnce();
    expect(target.maximize).toHaveBeenCalledOnce();
    expect(target.setTitle).toHaveBeenCalledWith("Project — src");
    expect(target.focus).toHaveBeenCalledOnce();
  });

  it("restores, closes, and force-destroys the same window", async () => {
    const { capability, target } = setup();
    target.isMaximized.mockReturnValue(true);

    await expect(capability.isMaximized(caller)).resolves.toBe(true);
    await capability.toggleMaximize(caller);
    await capability.close(caller);
    await capability.destroy(caller);

    expect(target.unmaximize).toHaveBeenCalledOnce();
    expect(target.close).toHaveBeenCalledOnce();
    expect(target.destroy).toHaveBeenCalledOnce();
  });

  it("does not show windows in the hidden E2E runtime", async () => {
    const { capability, target } = setup(true);
    await capability.show(caller);
    expect(target.show).not.toHaveBeenCalled();
  });

  it("reports a missing caller window instead of touching another window", async () => {
    const capability = createDesktopWindowControlCapability(() => null, false);
    await expect(capability.close(caller)).rejects.toThrow(
      'desktop.window could not resolve renderer window "main"',
    );
  });

  it("projects authenticated window events and detaches the remote subscription", () => {
    const { capability, emit, target } = setup();
    const eventSink = vi.fn();
    const subscribe = capability.subscribe as unknown as (
      event: "focus-changed",
      subscriber: typeof caller & { eventSink: (payload: unknown) => void },
    ) => () => void;

    const unsubscribe = subscribe("focus-changed", {
      ...caller,
      eventSink,
    });
    emit("focus");
    emit("blur");

    expect(eventSink.mock.calls).toEqual([[true], [false]]);
    unsubscribe();
    unsubscribe();
    emit("focus");
    expect(eventSink).toHaveBeenCalledTimes(2);
    expect(target.removeListener).toHaveBeenCalledTimes(2);
  });
});

function setupRenderer() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const control = {
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    minimize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    unmaximize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    isMaximized: vi.fn(async () => false),
    close: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    setTitle: vi.fn(async () => {}),
    focus: vi.fn(async () => {}),
    isFocused: vi.fn(async () => true),
    startDragging: vi.fn(async () => {}),
    subscribe: vi.fn((name: string, listener: (payload: unknown) => void) => {
      handlers.set(name, listener);
      return vi.fn();
    }),
  };
  const capability = createDesktopWindowCapability(control);
  return { capability, control, handlers };
}

describe("desktop.window renderer provider", () => {
  it("force-destroys after an unprevented close request", () => {
    const { capability, control, handlers } = setupRenderer();
    const listener = vi.fn();
    capability.onCloseRequested(listener);

    handlers.get("close-requested")?.(null);

    expect(listener).toHaveBeenCalledOnce();
    expect(control.destroy).toHaveBeenCalledOnce();
  });

  it("keeps the window open when the consumer prevents synchronously", () => {
    const { capability, control, handlers } = setupRenderer();
    capability.onCloseRequested((event) => event.preventDefault());

    handlers.get("close-requested")?.(null);

    expect(control.destroy).not.toHaveBeenCalled();
  });

  it("projects focus and resize events with disposable subscriptions", () => {
    const { capability, control, handlers } = setupRenderer();
    const focus = vi.fn();
    const resize = vi.fn();
    const stopFocus = capability.onFocusChanged(focus);
    const stopResize = capability.onResized(resize);

    handlers.get("focus-changed")?.(true);
    handlers.get("resized")?.({ width: 900, height: 700 });
    stopFocus();
    stopResize();

    expect(focus).toHaveBeenCalledWith(true);
    expect(resize).toHaveBeenCalledOnce();
    expect(control.subscribe).toHaveBeenCalledTimes(2);
  });
});
