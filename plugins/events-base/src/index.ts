export * from "./events";

/** Public contract alias of the kernel-owned local event primitive.
 *
 * Keep the value local to this base package. Runtime-importing @termco/kernel
 * here would leak that compiler-only external into every independently bundled
 * plugin that imports the events contract. */
export const EVENTS_APPLICATION_SERVICE = "kernel.events" as const;

/** Family-owned cross-process compatibility projection. Product plugins use
 * EVENTS_APPLICATION_SERVICE; only events-native provides this bridge. */
export const EVENTS_APPLICATION_BRIDGE_SERVICE = "events.application" as const;

declare module "@termco/kernel" {
  interface Services {
    [EVENTS_APPLICATION_BRIDGE_SERVICE]: import("./events").ApplicationEventsCapability;
  }
}
