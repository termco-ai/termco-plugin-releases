import type { PluginModule } from "@termco/kernel";
import type { ShellExecutionCapability } from "@termco/terminal-base";
import {
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_REGISTRY_SERVICE,
  type WorkspaceCapability,
  type WorkspaceEnv,
  type WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { bgCloseAll, bgKill, bgList, bgLogs, bgSpawn } from "./background";
import { runCommand } from "./oneshot";
import { configureWorkspace } from "./runtime";
import {
  liveSessions,
  sessionClose,
  sessionCloseAll,
  sessionOpen,
  sessionRun,
} from "./session";

function isRemote(workspace: WorkspaceEnv): boolean {
  return workspace?.kind === "ssh";
}

function remote<T>(execution: WorkspaceExecutionCapability, workspace: WorkspaceEnv, method: string, args: readonly unknown[]): Promise<T> {
  return execution.invoke<T>(workspace, { domain: "shell", method, args });
}

let active: ShellExecutionCapability | null = null;

const plugin: PluginModule = {
  inject: [
    WORKSPACE_REGISTRY_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
  ],
  async activate(context) {
    const workspace = context.get<WorkspaceCapability>("workspace.registry");
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    const remoteSessions = new Map<number, WorkspaceEnv>();
    const remoteJobs = new Map<number, WorkspaceEnv>();
    await context.effect(() => configureWorkspace(workspace));

    const capability: ShellExecutionCapability = {
      async run(command, cwd, timeoutSeconds, environment) {
        return isRemote(environment)
          ? remote<unknown>(execution, environment, "run", [command, cwd, timeoutSeconds])
          : runCommand(command, cwd, timeoutSeconds, environment);
      },
      async sessionOpen(cwd, environment) {
        if (!isRemote(environment)) return sessionOpen(cwd, environment);
        const id = await remote<number>(execution, environment, "sessionOpen", [cwd]);
        remoteSessions.set(id, environment);
        return id;
      },
      async sessionRun(id, command, cwd, timeoutSeconds, environment) {
        const remoteWorkspace = remoteSessions.get(id);
        return remoteWorkspace
          ? remote<unknown>(execution, remoteWorkspace, "sessionRun", [id, command, cwd, timeoutSeconds])
          : sessionRun(id, command, cwd, timeoutSeconds, environment);
      },
      async sessionClose(id) {
        const remoteWorkspace = remoteSessions.get(id);
        if (remoteWorkspace) {
          await remote<unknown>(execution, remoteWorkspace, "sessionClose", [id]);
          remoteSessions.delete(id);
        } else {
          sessionClose(id);
        }
      },
      async backgroundSpawn(command, cwd, environment) {
        if (!isRemote(environment)) return bgSpawn(command, cwd, environment);
        const handle = await remote<number>(execution, environment, "bgSpawn", [command, cwd]);
        remoteJobs.set(handle, environment);
        return handle;
      },
      async backgroundLogs(handle, sinceOffset) {
        const remoteWorkspace = remoteJobs.get(handle);
        return remoteWorkspace
          ? remote<unknown>(execution, remoteWorkspace, "bgLogs", [handle, sinceOffset])
          : bgLogs(handle, sinceOffset);
      },
      async backgroundKill(handle) {
        const remoteWorkspace = remoteJobs.get(handle);
        if (remoteWorkspace) {
          await remote<unknown>(execution, remoteWorkspace, "bgKill", [handle]);
          remoteJobs.delete(handle);
        } else {
          bgKill(handle);
        }
      },
      backgroundList: bgList,
      liveResources() {
        return [
          ...liveSessions(),
          ...bgList()
            .filter((job) => !job.exited)
            .map((job) => ({
              id: String(job.handle),
              label: `background job ${job.handle}: ${job.command}`,
            })),
        ];
      },
    };
    active = capability;
    await context.effect(() => () => {
      bgCloseAll();
      sessionCloseAll();
      remoteSessions.clear();
      remoteJobs.clear();
      if (active === capability) active = null;
    });
    context.provide("shell.execution", capability);
  },
  replacementImpact() {
    const resources = active?.liveResources() ?? [];
    return resources.length === 0
      ? []
      : [{ capability: "shell.execution", resourceLabel: "shell sessions and background jobs", resources }];
  },
};

export default plugin;
