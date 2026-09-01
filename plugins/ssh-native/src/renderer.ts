import {
  SSH_CLIENT_SERVICE,
  type SshCliOutput,
  type SshClientCapability,
  type SshTarget,
  type SshWorkspace,
} from "@termco/ssh-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
} from "@termco/kernel";

const SAFE_CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9_.@:-]*$/;
const CONNECT_OPTIONS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
const REMOTE_PATH_PRELUDE =
  'PATH="$HOME/.local/bin:$HOME/.claude/local:$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"; ' +
  'for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done; ' +
  "export PATH; ";

function resolveTarget(payload: Record<string, unknown>): SshTarget {
  const connectionId = payload.connectionId;
  if (
    typeof connectionId !== "string" ||
    connectionId.length > 255 ||
    !SAFE_CONNECTION_ID.test(connectionId)
  ) {
    throw new Error(`invalid ssh connection id: ${String(connectionId)}`);
  }
  let host = connectionId;
  let user: string | undefined;
  const at = host.lastIndexOf("@");
  if (at >= 0) {
    user = host.slice(0, at) || undefined;
    host = host.slice(at + 1);
  }
  let port: number | undefined;
  const colon = host.lastIndexOf(":");
  if (colon >= 0 && /^\d+$/.test(host.slice(colon + 1))) {
    port = Number(host.slice(colon + 1));
    host = host.slice(0, colon);
  }
  return { connectionId, host, user, port };
}

function destination(target: SshTarget): string {
  return target.user ? `${target.user}@${target.host}` : target.host;
}

function sshArgs(
  target: SshTarget,
  remote: string[],
  extraOptions: string[] = [],
): string[] {
  const args = [...CONNECT_OPTIONS, ...extraOptions];
  if (target.port) args.push("-p", String(target.port));
  args.push(destination(target), ...remote);
  return args;
}

export function createRendererSshCapability(
  transport: ProcessTransport,
): SshClientCapability {
  const remote = createProcessServiceProxy<SshClientCapability>(
    SSH_CLIENT_SERVICE,
    transport,
  );
  return Object.assign(Object.create(remote) as SshClientCapability, {
    resolveTarget,
    destination,
    sshArgs,
    ok(output: SshCliOutput) {
      return !output.spawnError && !output.timedOut && output.exitCode === 0;
    },
    remotePathPrelude: REMOTE_PATH_PRELUDE,
    base64: {
      encode: (bytes) => Buffer.from(bytes).toString("base64"),
      decode: (text) => Buffer.from(text, "base64"),
    },
    isWorkspace(value: unknown): value is SshWorkspace {
      return Boolean(
        value &&
          typeof value === "object" &&
          (value as { kind?: unknown }).kind === "ssh",
      );
    },
  } satisfies Partial<SshClientCapability>);
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      SSH_CLIENT_SERVICE,
      createRendererSshCapability(transport),
    );
  },
};

export default plugin;
