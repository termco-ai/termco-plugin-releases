import type {
  ContainerLogSearchResult,
  ContainersCapability,
  ContainersListResult,
  ContainerStats,
} from "@termco/containers-base";
import type { PluginModule } from "@termco/kernel";
import type { WorkspaceEnv, WorkspaceExecutionCapability } from "@termco/workspace-base";
import { listAll, resolveAdapter, resolveId } from "./ops";
import type { ContainerAction } from "./types";
import { WORKSPACE_EXECUTION_SERVICE } from "@termco/workspace-base";

const ACTIONS: ContainerAction[] = ["start", "stop", "restart"];
const IMAGE_REF = /^[A-Za-z0-9][A-Za-z0-9_./:@-]*$/;

function isRemote(workspace: WorkspaceEnv): boolean {
  return workspace?.kind === "ssh";
}

function remote<T>(execution: WorkspaceExecutionCapability, workspace: WorkspaceEnv, method: string, args: readonly unknown[]): Promise<T> {
  return execution.invoke<T>(workspace, { domain: "containers", method, args });
}

function imageRef(value: unknown): string {
  if (typeof value !== "string" || !IMAGE_REF.test(value)) {
    throw new Error(`invalid image ref: ${String(value)}`);
  }
  return value;
}

function query(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid search query");
  const result = value.trim();
  if (!result || result.length > 500) throw new Error("invalid search query");
  return result;
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_EXECUTION_SERVICE,
  ],
  activate(context) {
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    const capability: ContainersCapability = {
      async list(workspace) {
        return isRemote(workspace)
          ? remote<ContainersListResult>(execution, workspace, "list", [])
          : listAll();
      },
      async action(runtime, idValue, actionValue, workspace) {
        const id = resolveId(idValue);
        const action = actionValue as ContainerAction;
        if (!ACTIONS.includes(action)) throw new Error(`invalid container action: ${String(actionValue)}`);
        if (isRemote(workspace)) await remote<unknown>(execution, workspace, "action", [runtime, id, action]);
        else await resolveAdapter(runtime).action(id, action);
      },
      async logs(runtime, idValue, tailValue, workspace) {
        const id = resolveId(idValue);
        const requested = typeof tailValue === "number" && tailValue > 0 ? tailValue : 500;
        const tail = Math.min(requested, 10_000);
        return isRemote(workspace)
          ? remote<string>(execution, workspace, "logs", [runtime, id, tail])
          : resolveAdapter(runtime).logs(id, tail);
      },
      async logsSearch(runtime, idValue, queryValue, options, workspace) {
        const id = resolveId(idValue);
        const searchQuery = query(queryValue);
        const requested = typeof options.maxMatches === "number" && options.maxMatches > 0 ? options.maxMatches : 2_000;
        const searchOptions = {
          maxMatches: Math.min(requested, 5_000),
          regex: options.regex === true,
          context: typeof options.context === "number" && options.context > 0 ? Math.min(Math.floor(options.context), 20) : 0,
          caseSensitive: options.caseSensitive === true,
        };
        return isRemote(workspace)
          ? remote<ContainerLogSearchResult>(execution, workspace, "logsSearch", [runtime, id, searchQuery, searchOptions])
          : resolveAdapter(runtime).logsSearch(id, searchQuery, searchOptions);
      },
      async inspect(runtime, idValue, workspace) {
        const id = resolveId(idValue);
        return isRemote(workspace)
          ? remote<string>(execution, workspace, "inspect", [runtime, id])
          : resolveAdapter(runtime).inspect(id);
      },
      async stats(runtime, idValue, workspace) {
        const id = resolveId(idValue);
        return isRemote(workspace)
          ? remote<ContainerStats[]>(execution, workspace, "stats", [runtime, id])
          : resolveAdapter(runtime).stats(id);
      },
      async imageInspect(runtime, imageValue, workspace) {
        const image = imageRef(imageValue);
        return isRemote(workspace)
          ? remote<string>(execution, workspace, "imageInspect", [runtime, image])
          : resolveAdapter(runtime).imageInspect(image);
      },
    };
    context.provide("containers.runtime", capability);
  },
};

export default plugin;
