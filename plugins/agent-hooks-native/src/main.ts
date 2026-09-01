import { readFileSync } from "node:fs";
import type { AgentHooksCapability } from "@termco/agents-base";
import type { PluginModule } from "@termco/kernel";
import { hooksStatusFor, writeHooks } from "./index";
import { find, settingsPath } from "./spec";

const plugin: PluginModule = {
  activate(context) {
    const capability: AgentHooksCapability = {
      enable(agent) {
        const spec = find(agent);
        writeHooks(spec, settingsPath(spec));
      },
      status(agent) {
        try {
          const spec = find(agent);
          return hooksStatusFor(spec, readFileSync(settingsPath(spec), "utf8"));
        } catch {
          return false;
        }
      },
    };
    context.provide("agents.terminal-hooks", capability);
  },
};

export default plugin;
