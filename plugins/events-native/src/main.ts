import {
  EVENTS_APPLICATION_BRIDGE_SERVICE,
  EVENTS_APPLICATION_SERVICE,
} from "@termco/events-base";
import type { KernelEventsCapability, PluginModule } from "@termco/kernel";

/** Main already owns the kernel-local bus. This entrypoint intentionally has
 * no product service identity; it remains as the selectable bridge package. */
const plugin: PluginModule = {
  activate(context) {
    context.provide(
      EVENTS_APPLICATION_BRIDGE_SERVICE,
      context.get<KernelEventsCapability>(EVENTS_APPLICATION_SERVICE),
    );
  },
};

export default plugin;
