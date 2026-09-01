import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import {
  STORAGE_APPLICATION_SERVICE,
  type PreferencesCapability,
  type StorageCapability,
} from "@termco/storage-base";
import { createStablePreferences } from "./preferences";

const plugin: PluginModule = {
  async activate(context) {
    const stable = createStablePreferences();
    context.provide<PreferencesCapability>(
      "settings.preferences",
      stable.capability,
    );
    context.feature(
      {
        id: "durable-storage",
        label: "Durable preference storage",
        requires: [STORAGE_APPLICATION_SERVICE, EVENTS_APPLICATION_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) =>
        stable.bind(
          scope.get<StorageCapability>(STORAGE_APPLICATION_SERVICE),
          scope.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
        ),
    );
  },
};

export default plugin;
