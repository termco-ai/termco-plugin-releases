import type {
  WorkspaceEnv,
  WorkspaceExecutionBackend,
  WorkspaceExecutionBackendRegistry,
  WorkspaceExecutionCapability,
  WorkspaceExecutionKind,
  WorkspaceExecutionRequest,
  WorkspaceExecutionChannel,
} from "@termco/workspace-base";

class WorkspaceExecutionUnavailable extends Error {
  readonly name = "WorkspaceExecutionUnavailable";
  readonly code = "workspace-execution-unavailable" as const;

  constructor(
    readonly workspaceKind: WorkspaceExecutionKind,
    readonly operation: string,
    message: string,
  ) {
    super(message);
  }
}

function workspaceKind(workspace: WorkspaceEnv): WorkspaceExecutionKind {
  return workspace?.kind ?? "local";
}

function unavailableReason(kind: WorkspaceExecutionKind): string {
  const label = kind === "ssh" ? "SSH" : kind === "wsl" ? "WSL" : kind;
  return `No ${label} execution backend is active.`;
}

export function createWorkspaceExecutionBackendRegistry(): WorkspaceExecutionBackendRegistry {
  const listeners = new Set<() => void>();
  let backends: readonly WorkspaceExecutionBackend[] = [];
  const publish = (next: readonly WorkspaceExecutionBackend[]) => {
    backends = next;
    for (const listener of listeners) listener();
  };
  return {
    register(backend) {
      if (backends.some((candidate) => candidate.id === backend.id)) {
        throw new Error(`workspace execution backend "${backend.id}" is already registered`);
      }
      publish(
        [...backends, backend].sort(
          (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
        ),
      );
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        publish(backends.filter((candidate) => candidate !== backend));
      };
    },
    resolve(workspace) {
      const kind = workspaceKind(workspace);
      return backends.find(
        (backend) => backend.kind === kind && backend.status(workspace).available,
      );
    },
    snapshot: () => backends,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createWorkspaceExecutionCapability(
  backends: WorkspaceExecutionBackendRegistry,
): WorkspaceExecutionCapability {
  return {
    availability(workspace) {
      const backend = backends.resolve(workspace);
      if (backend) {
        return { available: true, backendId: backend.id, label: backend.label };
      }
      const kind = workspaceKind(workspace);
      const candidate = backends.snapshot().find((entry) => entry.kind === kind);
      return {
        available: false,
        code: "workspace-execution-unavailable",
        workspaceKind: kind,
        reason: candidate?.status(workspace).reason ?? unavailableReason(kind),
      };
    },
    prepare<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest): T {
      const backend = backends.resolve(workspace);
      if (!backend?.prepare) {
        const kind = workspaceKind(workspace);
        throw new WorkspaceExecutionUnavailable(
          kind,
          `${request.domain}.${request.method}`,
          unavailableReason(kind),
        );
      }
      return backend.prepare<T>(workspace, request);
    },
    async invoke<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest) {
      const backend = backends.resolve(workspace);
      if (!backend) {
        const availability = this.availability(workspace);
        const kind = workspaceKind(workspace);
        throw new WorkspaceExecutionUnavailable(
          kind,
          `${request.domain}.${request.method}`,
          availability.available ? unavailableReason(kind) : availability.reason,
        );
      }
      return backend.invoke<T>(workspace, request);
    },
    async openChannel(
      workspace: WorkspaceEnv,
      listener: (event: string, data: unknown) => void,
    ): Promise<WorkspaceExecutionChannel> {
      const backend = backends.resolve(workspace);
      if (!backend?.openChannel) {
        const kind = workspaceKind(workspace);
        throw new WorkspaceExecutionUnavailable(
          kind,
          "rpc.channel",
          unavailableReason(kind),
        );
      }
      return backend.openChannel(workspace, listener);
    },
  };
}

export function createLocalWorkspaceExecutionBackend(
  kind: "local" | "wsl" = "local",
): WorkspaceExecutionBackend {
  return {
    id: kind,
    kind,
    label: kind === "local" ? "Local machine" : "Windows Subsystem for Linux",
    priority: 0,
    status: () => ({ available: true }),
    async invoke(_workspace, request) {
      throw new WorkspaceExecutionUnavailable(
        kind,
        `${request.domain}.${request.method}`,
        `Local ${request.domain}.${request.method} is implemented by its owning provider.`,
      );
    },
  };
}
