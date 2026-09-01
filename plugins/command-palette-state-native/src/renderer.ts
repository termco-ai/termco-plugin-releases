import type { PluginModule } from "@termco/kernel";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import { createCommandPaletteState } from "./state";

const plugin: PluginModule = {
  activate(context) {
    context.provide<UiCommandPaletteCapability>(
      "ui.command-palette",
      createCommandPaletteState(),
    );
  },
};

export default plugin;
