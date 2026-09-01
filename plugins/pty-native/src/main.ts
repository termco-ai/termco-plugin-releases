import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import type { PtyCapability } from "@termco/terminal-base";
import {
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_REGISTRY_SERVICE,
  type WorkspaceCapability,
  type WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { detectShellName, listShells, type SshSpawnPrep } from "./shellInit";
import * as sessions from "./session";

let activeCapability: PtyCapability | null = null;

function workspaceExecutionUnavailable(reason: string): Error {
  return Object.assign(new Error(reason), {
    name: "WorkspaceExecutionUnavailable",
    code: "workspace-execution-unavailable" as const,
    workspaceKind: "ssh" as const,
    operation: "terminal.pty.open",
  });
}

export function ptyCapabilityActive(): boolean {
  return activeCapability !== null;
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_REGISTRY_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
  ],
  async activate(context) {
    const workspace = context.get<WorkspaceCapability>("workspace.registry");
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    await context.effect(() => {
      sessions.configurePtySessions({ workspace, events });
      return () => sessions.configurePtySessions(null);
    });

    const capability: PtyCapability = {
      async open(params, handlers) {
        let sshPrep = null;
        const remote = params.workspace;
        if (remote?.kind === "ssh") {
          const availability = execution.availability(remote);
          if (!availability.available) {
            throw workspaceExecutionUnavailable(availability.reason);
          }
          try {
            sshPrep = await execution.invoke<SshSpawnPrep>(remote, {
              domain: "ssh",
              method: "ensureShellIntegration",
              args: [],
            });
          } catch {
            // A plain remote login shell remains usable when integration fails.
          }
        }
        return sessions.open(
          { ...params, sshPrep },
          handlers.onData,
          handlers.onExit,
        );
      },
      write: sessions.write,
      resize: sessions.resize,
      close: sessions.close,
      closeAll: sessions.closeAll,
      hasForegroundProcess: sessions.hasForegroundProcess,
      hasForegroundJob: sessions.hasForegroundJob,
      shellName: detectShellName,
      listShells,
      liveSessions: sessions.liveSessions,
    };
    activeCapability = capability;
    await context.effect(() => () => {
      capability.closeAll();
      if (activeCapability === capability) activeCapability = null;
    });
    context.provide("terminal.pty", capability);
  },
  async replacementImpact() {
    const resources = activeCapability
      ? await activeCapability.liveSessions()
      : [];
    return resources.length === 0
      ? []
      : [
          {
            capability: "terminal.pty",
            resourceLabel: "local and interactive SSH terminal sessions",
            resources,
          },
        ];
  },
};

export default plugin;
