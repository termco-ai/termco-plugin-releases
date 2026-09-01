import type { PluginModule } from "@termco/kernel";
import type { SecretsCapability } from "@termco/storage-base";
import { app, safeStorage } from "electron";
import { createSecretStore } from "./backend";

const plugin: PluginModule = {
  async activate(context) {
    const store = createSecretStore({
      userData: app.getPath("userData"),
      safeStorage,
    });
    const capability: SecretsCapability = {
      get: store.get,
      set: store.set,
      delete: store.delete,
      getAll: store.getAll,
    };
    context.provide("secrets.application", capability);
  },
};

export default plugin;
