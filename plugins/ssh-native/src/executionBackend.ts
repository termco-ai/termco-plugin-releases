import type { SshClientCapability, SshTarget, SshWorkspace } from "@termco/ssh-base";
import type {
  WorkspaceEnv,
  WorkspaceExecutionBackend,
  WorkspaceExecutionRequest,
} from "@termco/workspace-base";

function sshWorkspace(workspace: WorkspaceEnv): SshWorkspace {
  if (!workspace || workspace.kind !== "ssh") {
    throw new Error("SSH execution requires an SSH workspace");
  }
  return workspace;
}

function target(workspace: SshWorkspace): SshTarget {
  return {
    connectionId: workspace.connectionId,
    host: workspace.host,
    user: workspace.user,
    port: workspace.port,
  };
}

function invokeMember<T>(
  owner: Record<string, unknown>,
  method: string,
  args: readonly unknown[],
): T {
  const member = owner[method];
  if (typeof member !== "function") {
    throw new Error(`SSH execution backend does not implement ${method}`);
  }
  return Reflect.apply(member, owner, args) as T;
}

export function createSshWorkspaceExecutionBackend(
  ssh: SshClientCapability,
): WorkspaceExecutionBackend {
  return {
    id: "ssh",
    kind: "ssh",
    label: "SSH",
    priority: 100,
    status: () => ({ available: true }),
    prepare<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest) {
      const remote = sshWorkspace(workspace);
      if (request.domain !== "ssh") {
        throw new Error(`SSH execution backend cannot prepare ${request.domain}.${request.method}`);
      }
      if (request.method === "sshArgs") {
        return ssh.sshArgs(
          target(remote),
          request.args[0] as string[],
          request.args[1] as string[] | undefined,
        ) as T;
      }
      if (request.method === "destination") {
        return ssh.destination(target(remote)) as T;
      }
      throw new Error(`SSH execution backend cannot prepare ssh.${request.method}`);
    },
    async openChannel(workspace, listener) {
      const connection = await ssh.getConnection(target(sshWorkspace(workspace)));
      const id = connection.client.openChannel(listener);
      return {
        id,
        call: (method, params) => connection.client.call(method, params),
        close: () => connection.client.closeChannel(id),
      };
    },
    async invoke<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest) {
      const remote = sshWorkspace(workspace);
      switch (request.domain) {
        case "files":
          if (request.method === "watchAdd") {
            return ssh.watchAdd(remote, request.args[0] as string[]) as Promise<T>;
          }
          if (request.method === "watchRemove") {
            return ssh.watchRemove(remote, request.args[0] as string[]) as Promise<T>;
          }
          return invokeMember<T>(ssh.fs, request.method, [remote, ...request.args]);
        case "shell":
          return invokeMember<T>(
            ssh.shell,
            request.method,
            request.method === "run" || request.method === "sessionOpen" || request.method === "bgSpawn"
              ? [remote, ...request.args]
              : request.args,
          );
        case "containers":
          return invokeMember<T>(ssh.containers, request.method, [remote, ...request.args]);
        case "git":
          if (request.method !== "run") {
            throw new Error(`SSH execution backend does not implement git.${request.method}`);
          }
          return ssh.gitRun(
            remote,
            request.args[0] as string | undefined,
            request.args[1] as string[],
          ) as Promise<T>;
        case "ssh": {
          if (request.method === "resolveHome") {
            return ssh.resolveHome(target(remote)) as Promise<T>;
          }
          if (request.method === "ensureShellIntegration") {
            return ssh.ensureShellIntegration(target(remote)) as Promise<T>;
          }
          return invokeMember<T>(ssh as unknown as Record<string, unknown>, request.method, request.args);
        }
        default:
          return ssh.call<T>(remote, `${request.domain}.${request.method}`, request.args[0]);
      }
    },
  };
}
