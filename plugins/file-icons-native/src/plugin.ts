import { UI_FILE_ICONS_SERVICE } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import { createFileIconRegistry } from "./registry";

const plugin: PluginModule = {
  inject: [],
  activate(context) {
    context.provide(UI_FILE_ICONS_SERVICE, createFileIconRegistry());
  },
};

export default plugin;
