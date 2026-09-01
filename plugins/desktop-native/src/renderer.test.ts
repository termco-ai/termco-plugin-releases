import {
  DESKTOP_INTEGRATION_SERVICE,
  DESKTOP_WINDOW_CONTROL_SERVICE,
  type DesktopDragDropEvent,
  type DesktopIntegrationCapability,
  type DesktopWindowControlCapability,
} from "@termco/desktop-base";
import {
  CapabilityRuntime,
  processTransportService,
  type ProcessCallOptions,
  type ProcessRemoteDispose,
  type ProcessTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("desktop window-control renderer bridge", () => {
  it("uses authenticated channels and releases local and remote subscription resources", async () => {
    const listeners = new Map<number, (...payload: unknown[]) => void>();
    const hostEventListeners = new Set<(...payload: unknown[]) => void>();
    const releaseChannel = vi.fn((channel: { __termcoChannel: number }) => {
      listeners.delete(channel.__termcoChannel);
    });
    const releaseRemote = vi.fn(
      async (_handle: ProcessRemoteDispose) => undefined,
    );
    let nextChannel = 0;
    let nextDispose = 0;
    const detachHostEvent = vi.fn();
    const transport = {
      call: vi.fn(
        async (
          _service: string,
          method: string,
          _args: readonly unknown[],
          _options?: ProcessCallOptions,
        ) => {
          if (method !== "subscribe") return undefined;
          return {
            __termcoDispose: `desktop-window-${++nextDispose}`,
          } satisfies ProcessRemoteDispose;
        },
      ),
      registerChannel(listener) {
        const channel = { __termcoChannel: ++nextChannel };
        listeners.set(channel.__termcoChannel, listener);
        return channel;
      },
      releaseChannel,
      releaseRemote,
      subscribeHostEvent: vi.fn(
        (name: string, listener: (...payload: unknown[]) => void) => {
          if (name !== "drag-drop") {
            throw new Error(`unexpected event ${name}`);
          }
          hostEventListeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            hostEventListeners.delete(listener);
            detachHostEvent();
          };
        },
      ),
    } satisfies ProcessTransport & {
      subscribeHostEvent(
        name: string,
        listener: (...payload: unknown[]) => void,
      ): () => void;
    };
    const tree = {
      profileId: "desktop-window-bridge",
      plugins: [
        {
          id: "desktop-native",
          manifest: {
            schemaVersion: 3 as const,
            id: "desktop-native",
            name: "Desktop",
            description: "Focused renderer bridge fixture.",
            category: "Test",
            version: "1.0.0",
            entrypoints: { renderer: "src/renderer.ts" },
            dependencies: {},
          },
          source: {
            type: "local" as const,
            module: "desktop-native",
            location: "desktop-native",
          },
        },
      ],
      activationOrder: ["desktop-native"],
    };
    const runtime = new CapabilityRuntime(tree);
    runtime.installExternalCapability(
      processTransportService,
      "kernel",
      transport,
    );
    await runtime.activate("desktop-native", plugin);
    const control = runtime.platformCapability<DesktopWindowControlCapability>(
      DESKTOP_WINDOW_CONTROL_SERVICE,
    );
    const desktop = runtime.platformCapability<DesktopIntegrationCapability>(
      DESKTOP_INTEGRATION_SERVICE,
    );
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribeFirst = control.subscribe(
      "focus-changed",
      firstListener,
    );
    control.subscribe("resized", secondListener);
    const payload = { focused: true, source: "native-window" };
    listeners.get(1)?.(payload);

    expect(firstListener).toHaveBeenCalledExactlyOnceWith(payload);
    expect(transport.call).toHaveBeenNthCalledWith(
      1,
      DESKTOP_WINDOW_CONTROL_SERVICE,
      "subscribe",
      ["focus-changed"],
      {
        caller: true,
        callerFields: { eventSink: { __termcoChannel: 1 } },
      },
    );
    const firstDropListener = vi.fn();
    const secondDropListener = vi.fn();
    const unsubscribeFirstDrop = desktop.subscribeDragDrop(firstDropListener);
    desktop.subscribeDragDrop(secondDropListener);
    expect(typeof unsubscribeFirstDrop).toBe("function");
    const dropPayload: DesktopDragDropEvent = {
      type: "drop",
      paths: ["/outside/project.txt"],
      position: { x: 17, y: 29 },
    };
    for (const listener of hostEventListeners) listener(dropPayload);
    expect(firstDropListener).toHaveBeenCalledExactlyOnceWith(dropPayload);
    expect(transport.subscribeHostEvent).toHaveBeenNthCalledWith(
      1,
      "drag-drop",
      firstDropListener,
    );
    const containsFunction = (value: unknown): boolean => {
      if (typeof value === "function") return true;
      if (!value || typeof value !== "object") return false;
      return Object.values(value).some(containsFunction);
    };
    expect(
      transport.call.mock.calls.some((call) => containsFunction(call)),
    ).toBe(false);

    unsubscribeFirst();
    unsubscribeFirst();
    unsubscribeFirstDrop();
    unsubscribeFirstDrop();
    await vi.waitFor(() => {
      expect(releaseChannel).toHaveBeenCalledExactlyOnceWith({
        __termcoChannel: 1,
      });
      expect(releaseRemote).toHaveBeenCalledExactlyOnceWith({
        __termcoDispose: "desktop-window-1",
      });
      expect(detachHostEvent).toHaveBeenCalledOnce();
    });

    await runtime.deactivate("desktop-native");
    expect(releaseChannel).toHaveBeenCalledTimes(2);
    expect(releaseRemote).toHaveBeenCalledTimes(2);
    expect(detachHostEvent).toHaveBeenCalledTimes(2);
    expect(new Set(releaseRemote.mock.calls.map(([handle]) => handle))).toEqual(
      new Set([
        { __termcoDispose: "desktop-window-1" },
        { __termcoDispose: "desktop-window-2" },
      ]),
    );
  });
});
