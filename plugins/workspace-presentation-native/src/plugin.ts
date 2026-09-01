import type { PluginModule } from "@termco/kernel";
import type { WorkspacePresentationCapability, WorkspacePresentationControlCapability } from "@termco/workspace-base";
import { WorkspacePresentationStore } from "./store";

const plugin: PluginModule = {
  activate(context) {
    const store = new WorkspacePresentationStore();
    context.provide<WorkspacePresentationCapability>(
      "workspace.presentation",
      store,
    );
    context.provide<WorkspacePresentationControlCapability>(
      "workspace.presentation-control",
      store,
    );
  },
};

export default plugin;
