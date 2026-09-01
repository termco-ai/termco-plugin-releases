import type { PluginModule } from "@termco/kernel";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandItem,
  type UiCommandRegistry,
} from "@termco/ui-commands-base";

export const companyCommand: UiCommandItem = {
  id: "company-example.ping",
  title: "Example Company: Ping",
  description: "Run the example organization-provided palette command.",
  group: "Example Company",
  keywords: ["company", "organization", "ping"],
  run: () => {
    window.dispatchEvent(new CustomEvent("termco:company-example-ping"));
  },
};

const plugin: PluginModule = {
  inject: [UI_COMMANDS_SERVICE],
  async activate(context) {
    await context.effect(() =>
      context.get<UiCommandRegistry>("ui.commands").register(companyCommand, {
        pluginId: "company-example-command",
        generation: context.generation,
        key: companyCommand.id,
      }),
    );
  },
};

export default plugin;
