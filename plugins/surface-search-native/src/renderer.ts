import type { PluginModule } from "@termco/kernel";
import type { UiSurfaceSearchCapability } from "@termco/ui-tabs-base";
import { SurfaceSearchRegistry } from "./searchRegistry";

const plugin: PluginModule = {
  activate(context) {
    const registry = new SurfaceSearchRegistry();
    context.provide<UiSurfaceSearchCapability>("ui.surface-search", registry);
    return () => registry.dispose();
  },
};

export default plugin;
