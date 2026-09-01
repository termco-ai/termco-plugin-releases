import type { PluginModule } from "@termco/kernel";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import { SidebarNavigation } from "./navigation";

const plugin: PluginModule = {
  activate(context) {
    const navigation = new SidebarNavigation(window.localStorage, {
      set: (callback, delay) => window.setTimeout(callback, delay),
      clear: (id) => window.clearTimeout(id),
    });
    context.provide<UiSidebarNavigationCapability>(
      "ui.sidebar-navigation",
      navigation,
    );
    return () => navigation.dispose();
  },
};

export default plugin;
