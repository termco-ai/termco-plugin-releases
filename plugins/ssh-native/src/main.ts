import { app, powerMonitor } from "electron";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import type {
  SshClientCapability,
  SshPortScanResult,
  SshTarget,
  SshWorkspace,
} from "@termco/ssh-base";
import {
  isSshShellHandle,
  isSshWorkspace,
  sshContainers,
  sshFs,
  sshGitRun,
  sshNet,
  sshShellBgKill,
  sshShellBgLogs,
  sshShellBgSpawn,
  sshShellRun,
  sshShellSessionClose,
  sshShellSessionOpen,
  sshShellSessionRun,
  sshWatchAdd,
  sshWatchRemove,
  call,
} from "./backend";
import { listConfigHosts } from "./config";
import {
  connectionStatus,
  disconnect,
  disconnectAll,
  getConnection,
  liveConnections,
  onConnectionReady,
} from "./connection";
import { joinDetectedPorts } from "./dockerPorts";
import { configureEvents } from "./events";
import type { ForwardAddInput, ForwardInfo } from "./forwards";
import {
  clientStateHub,
  forwardManager,
  killForwardsSync,
  resolveTarget,
  resumeForwards,
  shutdownForwards,
} from "./index";
import { resolveHome } from "./probe";
import { REMOTE_PATH_PRELUDE } from "./pathPrelude";
import { b64 } from "./protocol";
import { destination, ok, runSsh, sshArgs } from "./runner";
import { ensureShellIntegration } from "./shellIntegration";
import {
  WORKSPACE_EXECUTION_BACKENDS_SERVICE,
  type WorkspaceExecutionBackendRegistry,
} from "@termco/workspace-base";
import { createSshWorkspaceExecutionBackend } from "./executionBackend";

let activeCapability: SshClientCapability | null = null;

export function sshCapabilityActive(): boolean {
  return activeCapability !== null;
}

async function scanPorts(workspace: SshWorkspace): Promise<SshPortScanResult> {
  const [portsResult, containersResult] = await Promise.allSettled([
    sshNet.listeningPorts(workspace),
    sshContainers.list(workspace),
  ]);
  if (portsResult.status === "rejected") {
    if (String(portsResult.reason).includes("unknown method")) {
      return { ports: [], outdated: true };
    }
    throw portsResult.reason;
  }
  const containers =
    containersResult.status === "fulfilled"
      ? (containersResult.value as { containers?: Array<{ name: string; ports: string }> })
          .containers ?? []
      : [];
  return {
    ports: joinDetectedPorts(
      portsResult.value as Array<{
        port: number;
        addresses: string[];
        loopbackOnly: boolean;
        process: string | null;
      }>,
      containers,
    ),
    outdated: false,
  };
}

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_EXECUTION_BACKENDS_SERVICE,
  ],
  async activate(context) {
    await context.effect(() => {
      configureEvents(context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE));
      return () => configureEvents(null);
    });

    await context.effect(() =>
      onConnectionReady((connection) => {
        void clientStateHub().attach(connection);
      }),
    );
    const onResume = () => resumeForwards();
    await app.whenReady();
    await context.effect(() => {
      powerMonitor.on("resume", onResume);
      return () => {
        powerMonitor.removeListener("resume", onResume);
      };
    });
    const onProcessExit = () => killForwardsSync();
    await context.effect(() => {
      process.on("exit", onProcessExit);
      return () => {
        process.removeListener("exit", onProcessExit);
      };
    });

    const capability = {
      resolveTarget,
      listHosts: listConfigHosts,
      resolveHome,
      async connect(target: SshTarget) {
        await getConnection(target);
        return connectionStatus(target.connectionId);
      },
      async connectId(connectionId: string) {
        const target = resolveTarget({ connectionId });
        await getConnection(target);
        return connectionStatus(target.connectionId);
      },
      status: connectionStatus,
      disconnect,
      getConnection,
      call,
      ensureShellIntegration,
      destination,
      sshArgs,
      runSsh,
      ok,
      remotePathPrelude: REMOTE_PATH_PRELUDE,
      base64: b64,
      isWorkspace: isSshWorkspace,
      fs: sshFs,
      containers: sshContainers,
      net: sshNet,
      shell: {
        isHandle: isSshShellHandle,
        run: sshShellRun,
        sessionOpen: sshShellSessionOpen,
        sessionRun: sshShellSessionRun,
        sessionClose: sshShellSessionClose,
        bgSpawn: sshShellBgSpawn,
        bgLogs: sshShellBgLogs,
        bgKill: sshShellBgKill,
      },
      gitRun: sshGitRun,
      watchAdd: sshWatchAdd,
      watchRemove: sshWatchRemove,
      forwardAdd: (connectionId: string, input: ForwardAddInput) =>
        forwardManager().add(connectionId, input),
      forwardStart: (id: string) => forwardManager().start(id),
      forwardStop: (id: string) => forwardManager().stop(id),
      forwardRemove: (id: string) => forwardManager().remove(id),
      forwardList: (connectionId?: string) => forwardManager().list(connectionId),
      forwardEnsure: (connectionId: string) => forwardManager().ensure(connectionId),
      forwards: {
        add: (connectionId: string, input: unknown) =>
          forwardManager().add(connectionId, input as ForwardAddInput),
        start: (id: string) => forwardManager().start(id),
        stop: (id: string) => forwardManager().stop(id),
        remove: (id: string) => forwardManager().remove(id),
        list: (connectionId?: string) => forwardManager().list(connectionId),
        ensure: (connectionId: string) => forwardManager().ensure(connectionId),
      },
      state: (connectionId: string) => clientStateHub().getState(connectionId),
      scanPorts,
      liveResources() {
        const connections = liveConnections();
        const forwards = forwardManager()
          .list()
          .then((values) => values as ForwardInfo[]);
        // Forward loading is async; active connection resources are always
        // available synchronously. The replacementImpact hook awaits forwards.
        void forwards;
        return connections;
      },
    } as unknown as SshClientCapability;

    await context.effect(() =>
      context
        .get<WorkspaceExecutionBackendRegistry>(WORKSPACE_EXECUTION_BACKENDS_SERVICE)
        .register(createSshWorkspaceExecutionBackend(capability)),
    );

    activeCapability = capability;
    await context.effect(() => async () => {
      shutdownForwards();
      await disconnectAll();
      if (activeCapability === capability) activeCapability = null;
    });
    context.provide("ssh.client", capability);
  },
  async replacementImpact() {
    if (!activeCapability) return [];
    const resources = activeCapability.liveResources();
    const forwards = (await activeCapability.forwards.list()) as Array<{
      id: string;
      connectionId: string;
      localPort: number;
      remoteHost: string;
      remotePort: number;
      desired: string;
    }>;
    for (const forward of forwards) {
      if (forward.desired !== "running") continue;
      resources.push({
        id: forward.id,
        label: `${forward.connectionId}: localhost:${forward.localPort} → ${forward.remoteHost}:${forward.remotePort}`,
      });
    }
    return resources.length === 0
      ? []
      : [
          {
            capability: "ssh.client",
            resourceLabel: "SSH sessions and port forwards",
            resources,
          },
        ];
  },
};

export default plugin;
