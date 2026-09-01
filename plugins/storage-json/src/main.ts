import type { PluginModule } from "@termco/kernel";
import type { StorageCapability } from "@termco/storage-base";
import { app } from "electron";
import { createJsonStorage } from "./storage";

const plugin: PluginModule = {
  activate(context) {
    const capability: StorageCapability = createJsonStorage(app.getPath("userData"));
    context.provide("storage.application", capability);
  },
};

export default plugin;
