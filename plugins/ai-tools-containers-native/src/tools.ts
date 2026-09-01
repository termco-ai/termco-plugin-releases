import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type {
  ContainerAction,
  ContainerRuntime,
  ContainersCapability,
} from "@termco/containers-base";
import type { SshClientCapability } from "@termco/ssh-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export interface ContainerToolContext {
  getWorkspaceEnv?(): WorkspaceEnv;
}

const EMPTY = { type: "object", properties: {}, additionalProperties: false };
const RUNTIME = {
  type: "string",
  enum: ["docker", "podman", "apple"],
  default: "docker",
  description: "Runtime returned by container_list; defaults to docker.",
};

function object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function workspace(context: ContainerToolContext): WorkspaceEnv {
  return context.getWorkspaceEnv?.() ?? { kind: "local" };
}

function runtimeValue(value: unknown): ContainerRuntime {
  return value === "podman" || value === "apple" ? value : "docker";
}

function actionValue(value: unknown): ContainerAction {
  if (value === "start" || value === "stop" || value === "restart") return value;
  throw new Error(`invalid container action: ${String(value)}`);
}

function definition(
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: Record<string, unknown>) => Promise<unknown>,
  needsApproval = false,
): AiToolDefinition {
  return {
    description,
    inputSchema,
    execute: (input) => execute(object(input)),
    ...(needsApproval ? { needsApproval: true } : {}),
  };
}

export function buildContainerTools(
  containers: ContainersCapability,
  context: ContainerToolContext,
): Record<string, AiToolDefinition> {
  return {
    container_list: definition(
      "List containers across Docker, Podman, and Apple Container. Returns compact ids, names, images, states, and exact runtime values required by the other tools.",
      EMPTY,
      async () => {
        try {
          const result = await containers.list(workspace(context)) as {
            containers?: Array<{ id: string; name: string; image: string; state: string; runtime: string }>;
            availability?: unknown;
          };
          return {
            containers: (result.containers ?? []).map((entry) => ({ id: entry.id, name: entry.name, image: entry.image, state: entry.state, runtime: entry.runtime })),
            availability: result.availability,
          };
        } catch (error) { return { error: String(error) }; }
      },
    ),
    container_logs: definition(
      "Fetch recent stdout/stderr logs for a container. Call container_list first for id and runtime.",
      { type: "object", properties: { id: { type: "string" }, runtime: RUNTIME, tail: { type: "integer", minimum: 1 } }, required: ["id"], additionalProperties: false },
      async ({ id, runtime, tail }) => {
        try { return { id, runtime: runtime ?? "docker", logs: await containers.logs(runtimeValue(runtime), String(id), typeof tail === "number" ? tail : undefined, workspace(context)) }; }
        catch (error) { return { error: String(error) }; }
      },
    ),
    container_logs_search: definition(
      "Search a container's complete log stream on the host. Supports literal or regular-expression matching, context lines, case sensitivity, and a result cap.",
      { type: "object", properties: { id: { type: "string" }, runtime: RUNTIME, query: { type: "string" }, regex: { type: "boolean" }, context: { type: "integer", minimum: 0, maximum: 20 }, caseSensitive: { type: "boolean" }, maxMatches: { type: "integer", minimum: 1 } }, required: ["id", "query"], additionalProperties: false },
      async ({ id, runtime, query, regex, context: lines, caseSensitive, maxMatches }) => {
        if (regex === true) {
          try { new RegExp(String(query)); }
          catch (error) { return { error: `invalid regex: ${String(error)}. Escape special characters or search literally.` }; }
        }
        try {
          const result = await containers.logsSearch(runtimeValue(runtime), String(id), String(query), { maxMatches: typeof maxMatches === "number" ? maxMatches : undefined, regex: regex === true, context: typeof lines === "number" ? lines : undefined, caseSensitive: caseSensitive === true }, workspace(context));
          return { id, runtime: runtime ?? "docker", ...(result as object) };
        } catch (error) { return { error: String(error) }; }
      },
    ),
    container_inspect: definition(
      "Return the complete low-level JSON configuration and state of a container.",
      { type: "object", properties: { id: { type: "string" }, runtime: RUNTIME }, required: ["id"], additionalProperties: false },
      async ({ id, runtime }) => {
        try { return { id, runtime: runtime ?? "docker", inspect: await containers.inspect(runtimeValue(runtime), String(id), workspace(context)) }; }
        catch (error) { return { error: String(error) }; }
      },
    ),
    container_stats: definition(
      "Return a live CPU, memory, network, IO, and process snapshot for a container.",
      { type: "object", properties: { id: { type: "string" }, runtime: RUNTIME }, required: ["id"], additionalProperties: false },
      async ({ id, runtime }) => {
        try { return { id, runtime: runtime ?? "docker", stats: await containers.stats(runtimeValue(runtime), String(id), workspace(context)) }; }
        catch (error) { return { error: String(error) }; }
      },
    ),
    container_action: definition(
      "Start, stop, or restart a container. Always asks the user first.",
      { type: "object", properties: { id: { type: "string" }, runtime: RUNTIME, action: { type: "string", enum: ["start", "stop", "restart"] } }, required: ["id", "action"], additionalProperties: false },
      async ({ id, runtime, action }) => {
        try { await containers.action(runtimeValue(runtime), String(id), actionValue(action), workspace(context)); return { id, runtime: runtime ?? "docker", action, ok: true }; }
        catch (error) { return { error: String(error) }; }
      },
      true,
    ),
  };
}

const NO_SSH = { error: "not in an SSH rig — port forwarding and scanning require the chat's active SSH workspace." };

function connectionId(context: ContainerToolContext): string | null {
  const environment = workspace(context);
  return environment?.kind === "ssh" ? environment.connectionId : null;
}

export function buildPortTools(
  ssh: SshClientCapability,
  context: ContainerToolContext,
): Record<string, AiToolDefinition> {
  return {
    ports_list: definition("List shared SSH port forwards for the active remote workspace.", EMPTY, async () => {
      const id = connectionId(context); if (!id) return NO_SSH;
      try { return { forwards: await ssh.forwardList(id) }; } catch (error) { return { error: String(error) }; }
    }),
    ports_scan: definition("Scan the active remote host for listening TCP ports and owning containers.", EMPTY, async () => {
      const environment = workspace(context); if (!environment || environment.kind !== "ssh") return NO_SSH;
      try { return await ssh.scanPorts(environment); } catch (error) { return { error: String(error) }; }
    }),
    port_forward_add: definition(
      "Create a shared SSH port forward from a local port to a remote service. Always asks first.",
      { type: "object", properties: { remotePort: { type: "integer", minimum: 1, maximum: 65535 }, localPort: { anyOf: [{ type: "integer", minimum: 1, maximum: 65535 }, { const: "auto" }], default: "auto" }, remoteHost: { type: "string" } }, required: ["remotePort"], additionalProperties: false },
      async ({ remotePort, localPort, remoteHost }) => {
        const id = connectionId(context); if (!id) return NO_SSH;
        try { return { ok: true, forward: await ssh.forwardAdd(id, { remotePort: Number(remotePort), localPort: localPort === undefined ? "auto" : localPort as number | "auto", ...(typeof remoteHost === "string" ? { remoteHost } : {}) }) }; }
        catch (error) { return { error: String(error) }; }
      }, true,
    ),
    port_forward_start: forwardMutation("Start a stopped shared SSH port forward. Always asks first.", (id) => ssh.forwardStart(id)),
    port_forward_stop: forwardMutation("Stop a running shared SSH port forward. Always asks first.", (id) => ssh.forwardStop(id)),
    port_forward_remove: definition("Remove a shared SSH port forward. Always asks first.", { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, async ({ id }) => {
      try { await ssh.forwardRemove(String(id)); return { ok: true, removed: id }; } catch (error) { return { error: String(error) }; }
    }, true),
  };
}

function forwardMutation(description: string, mutate: (id: string) => Promise<unknown>): AiToolDefinition {
  return definition(description, { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, async ({ id }) => {
    try { return { ok: true, forward: await mutate(String(id)) }; } catch (error) { return { error: String(error) }; }
  }, true);
}

export function createContainerToolContributions(
  containers: ContainersCapability,
  ssh?: SshClientCapability,
): AiToolContribution[] {
  return [
    { id: "containers", group: "containers", order: 60, build: (context) => buildContainerTools(containers, context as ContainerToolContext) },
    ...(ssh
      ? [{ id: "ports", group: "containers", order: 70, build: (context: unknown) => buildPortTools(ssh, context as ContainerToolContext) }]
      : []),
  ];
}
