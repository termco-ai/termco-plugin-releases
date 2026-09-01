import type {
  ApplicationEventListener,
  ApplicationEventsCapability,
  AnyApplicationEventListener,
} from "@termco/events-base";
import { EVENTS_APPLICATION_BRIDGE_SERVICE } from "@termco/events-base";
import {
  kernelEventsService,
  processTransportService,
  type KernelEventsCapability,
  type PluginModule,
  type ProcessRemoteDispose,
  type ProcessTransport,
} from "@termco/kernel";

/** Compatibility seam used by the preserved bridge contract tests. Product
 * activation uses the kernel-local bus plus connectRendererApplicationEvents. */
export function createRendererApplicationEvents(
  transport: ProcessTransport,
): ApplicationEventsCapability {
  const listenerCounts = new Map<string, number>();
  const subscribe = (
    method: "subscribe" | "subscribeAll",
    args: readonly unknown[],
    listener: (...messages: unknown[]) => void,
  ) => {
    const channel = transport.registerChannel(listener);
    const remote = transport.call(EVENTS_APPLICATION_BRIDGE_SERVICE, method, [
      ...args,
      channel,
    ]) as Promise<ProcessRemoteDispose>;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      transport.releaseChannel(channel);
      void remote.then(
        (handle) => transport.releaseRemote(handle),
        () => {},
      );
    };
  };
  return {
    emit(event, payload) {
      void transport.call(EVENTS_APPLICATION_BRIDGE_SERVICE, "emit", [event, payload]);
    },
    subscribe(event: string, listener: ApplicationEventListener) {
      listenerCounts.set(event, (listenerCounts.get(event) ?? 0) + 1);
      const dispose = subscribe("subscribe", [event], listener);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        listenerCounts.set(
          event,
          Math.max(0, (listenerCounts.get(event) ?? 1) - 1),
        );
        dispose();
      };
    },
    subscribeAll(listener: AnyApplicationEventListener) {
      return subscribe("subscribeAll", [], (...messages) => {
        if (typeof messages[0] !== "string") return;
        listener(messages[0], messages[1]);
      });
    },
    listenerCount(event) {
      return listenerCounts.get(event) ?? 0;
    },
  };
}

export function connectRendererApplicationEvents(
  events: KernelEventsCapability,
  transport: ProcessTransport,
): () => void {
  const channel = transport.registerChannel((...messages) => {
    if (typeof messages[0] !== "string") return;
    events.deliver(messages[0], messages[1]);
  });
  const remote = transport.call(EVENTS_APPLICATION_BRIDGE_SERVICE, "subscribeAll", [
    channel,
  ]) as Promise<ProcessRemoteDispose>;
  const disconnectOutbound = events.connectOutbound((event, payload) => {
    void transport.call(EVENTS_APPLICATION_BRIDGE_SERVICE, "emit", [event, payload]);
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    disconnectOutbound();
    transport.releaseChannel(channel);
    void remote.then(
      (handle) => transport.releaseRemote(handle),
      () => {},
    );
  };
}

const plugin: PluginModule = {
  inject: [processTransportService],
  async activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    const events = context.get<KernelEventsCapability>(kernelEventsService);
    context.provide(
      EVENTS_APPLICATION_BRIDGE_SERVICE,
      createRendererApplicationEvents(transport),
    );
    await context.effect(() =>
      connectRendererApplicationEvents(events, transport),
    );
  },
};

export default plugin;
