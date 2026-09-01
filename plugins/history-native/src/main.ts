import type { PluginModule } from "@termco/kernel";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import type { WorkspaceEnv, WorkspaceExecutionCapability } from "@termco/workspace-base";
import { HistoryState } from "./state";
import { WORKSPACE_EXECUTION_SERVICE } from "@termco/workspace-base";

function isRemote(workspace: WorkspaceEnv): boolean {
  return workspace?.kind === "ssh";
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_EXECUTION_SERVICE,
  ],
  async activate(context) {
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    const state = new HistoryState();
    await context.effect(() => {
      const prewarm = setTimeout(
        () => void state.prewarm().catch(() => {}),
        2_000,
      );
      return () => clearTimeout(prewarm);
    });
    const capability: ShellHistoryCapability = {
      async suggest(line, workspace) {
        return isRemote(workspace)
          ? execution.invoke<string | null>(workspace, { domain: "history", method: "suggest", args: [{ line }] })
          : state.suggest(line);
      },
      async commands(prefix, limit, workspace) {
        return isRemote(workspace)
          ? execution.invoke<string[]>(workspace, { domain: "history", method: "commands", args: [{ prefix, limit }] })
          : state.commands(prefix, limit);
      },
      async list(query, limit, workspace) {
        return isRemote(workspace)
          ? execution.invoke<string[]>(workspace, { domain: "history", method: "list", args: [{ query, limit }] })
          : state.list(query, limit);
      },
      async record(command, workspace) {
        if (isRemote(workspace)) {
          await execution.invoke(workspace, { domain: "history", method: "record", args: [{ command }] });
        } else {
          state.record(command);
        }
      },
    };
    context.provide("terminal.history", capability);
  },
};

export default plugin;
