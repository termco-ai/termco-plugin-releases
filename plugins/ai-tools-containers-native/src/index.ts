import type { ContainersCapability } from "@termco/containers-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import type { SshClientCapability } from "@termco/ssh-base";
import { createContainerToolContributions } from "./tools";
import { CONTAINERS_RUNTIME_SERVICE } from "@termco/containers-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";
import { SSH_CLIENT_SERVICE } from "@termco/ssh-base";

const plugin: PluginModule = {
  inject: [
    CONTAINERS_RUNTIME_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const registry = context.get<AiToolRegistry>("ai.tools");
    const containers = context.get<ContainersCapability>("containers.runtime");
    for (const contribution of createContainerToolContributions(containers)) {
      await context.effect(() => registry.register(contribution));
    }
    context.feature(
      {
        id: "ssh-port-tools",
        label: "SSH port tools",
        requires: [SSH_CLIENT_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const [ports] = createContainerToolContributions(
          containers,
          scope.get<SshClientCapability>(SSH_CLIENT_SERVICE),
        ).filter((contribution) => contribution.id === "ports");
        return ports ? registry.register(ports) : undefined;
      },
    );
  },
};

export default plugin;
