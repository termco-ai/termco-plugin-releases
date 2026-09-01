import type { ContainerSummary } from "@termco/containers-base";
import type { SshForwardInfo } from "@termco/ssh-base";
import type {
  WorkflowDefinition,
  WorkflowParameter,
  WorkflowParamSource,
  WorkflowTarget,
  WorkflowValues,
} from "@termco/workflows-base";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function quoteShellArg(value: string): string {
  const windows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  return windows
    ? `'${value.replace(/'/g, "''")}'`
    : `'${value.replace(/'/g, "'\\''")}'`;
}

function valueFor(
  parameter: WorkflowParameter | undefined,
  raw: string | undefined,
): string {
  const value = raw ?? parameter?.default ?? "";
  return parameter?.quote && value !== "" ? quoteShellArg(value) : value;
}

function renderTemplate(
  template: string,
  parameters: readonly WorkflowParameter[],
  values: WorkflowValues,
): string {
  const byName = new Map(
    parameters.map((parameter) => [parameter.name, parameter]),
  );
  return template.replace(PLACEHOLDER, (_all, name: string) =>
    valueFor(byName.get(name), values[name]),
  );
}

export function renderSteps(
  workflow: WorkflowDefinition,
  values: WorkflowValues,
): string[] {
  const templates = workflow.steps?.length
    ? workflow.steps
    : [workflow.command];
  return templates.map((template) =>
    renderTemplate(template, workflow.parameters, values),
  );
}

export function missingRequired(
  workflow: WorkflowDefinition,
  values: WorkflowValues,
): string[] {
  return workflow.parameters
    .filter((parameter) => parameter.required)
    .filter(
      (parameter) =>
        !(values[parameter.name] ?? parameter.default ?? "").trim(),
    )
    .map((parameter) => parameter.name);
}

export function newWorkflowId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function chainWorkflow(
  workflow: WorkflowDefinition,
  values: WorkflowValues,
): string {
  return renderSteps(workflow, values)
    .filter((command) => command.trim())
    .join(" && ");
}

export type ResourceOption = {
  value: string;
  label: string;
  hint?: string;
};

export function containerOptions(
  containers: readonly ContainerSummary[],
): ResourceOption[] {
  return containers.map((container) => ({
    value: container.name || container.id,
    label: container.name || container.id.slice(0, 12),
    hint: container.image,
  }));
}

export function containerImageOptions(
  containers: readonly ContainerSummary[],
): ResourceOption[] {
  const seen = new Set<string>();
  const options: ResourceOption[] = [];
  for (const container of containers) {
    if (!container.image || seen.has(container.image)) continue;
    seen.add(container.image);
    options.push({ value: container.image, label: container.image });
  }
  return options;
}

export function sshHostOptions(
  hosts: readonly { host: string; user?: string }[],
): ResourceOption[] {
  return hosts.map((host) => ({
    value: host.host,
    label: host.host,
    hint: host.user ? `${host.user}@${host.host}` : undefined,
  }));
}

export function portOptions(
  forwards: readonly SshForwardInfo[],
): ResourceOption[] {
  const seen = new Set<number>();
  const options: ResourceOption[] = [];
  for (const forward of forwards) {
    if (seen.has(forward.localPort)) continue;
    seen.add(forward.localPort);
    options.push({
      value: String(forward.localPort),
      label: String(forward.localPort),
      hint: `${forward.remoteHost}:${forward.remotePort}`,
    });
  }
  return options;
}

export function prebindParamName(
  parameters: readonly { name: string; source: WorkflowParamSource }[],
  source: WorkflowParamSource,
): string | undefined {
  return parameters.find((parameter) => parameter.source === source)?.name;
}

export interface WorkflowRunnerDependencies {
  getActiveLeafId(): number | null;
  openTerminal(cwd?: string): Promise<number>;
  runInLeaf(leafId: number, command: string): void;
  containerExecPrefix?(ref: string): string | null;
  runOnSshHost?(connectionId: string, command: string): Promise<void>;
  handToAi?(command: string): void;
}

export type WorkflowRunOutcome =
  | { ok: true; command: string }
  | { ok: false; error: string };

export async function runWorkflow(
  workflow: WorkflowDefinition,
  values: WorkflowValues,
  target: WorkflowTarget,
  dependencies: WorkflowRunnerDependencies,
): Promise<WorkflowRunOutcome> {
  const command = chainWorkflow(workflow, values);
  if (!command) return { ok: false, error: "Nothing to run." };

  switch (target.kind) {
    case "focused_terminal": {
      const leafId =
        dependencies.getActiveLeafId() ?? (await dependencies.openTerminal());
      dependencies.runInLeaf(leafId, command);
      return { ok: true, command };
    }
    case "new_terminal": {
      const cwd = target.cwd === "inherit" ? undefined : target.cwd;
      const leafId = await dependencies.openTerminal(cwd);
      dependencies.runInLeaf(leafId, command);
      return { ok: true, command };
    }
    case "container": {
      if (!dependencies.containerExecPrefix || !target.ref) {
        return { ok: false, error: "No container selected." };
      }
      const prefix = dependencies.containerExecPrefix(target.ref);
      if (!prefix) {
        return { ok: false, error: "That container is not available." };
      }
      const executed = `${prefix} ${command}`;
      const leafId = await dependencies.openTerminal();
      dependencies.runInLeaf(leafId, executed);
      return { ok: true, command: executed };
    }
    case "ssh": {
      if (!dependencies.runOnSshHost || !target.ref) {
        return { ok: false, error: "No SSH host selected." };
      }
      await dependencies.runOnSshHost(target.ref, command);
      return { ok: true, command };
    }
    case "ai": {
      if (!dependencies.handToAi) {
        return {
          ok: false,
          error: "The AI agent isn't available here.",
        };
      }
      dependencies.handToAi(command);
      return { ok: true, command };
    }
  }
}

export function containerExecPrefix(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const separator = trimmed.indexOf(":");
  if (separator > 0) {
    const runtime = trimmed.slice(0, separator);
    const id = trimmed.slice(separator + 1);
    if (["docker", "podman", "apple"].includes(runtime) && id) {
      const binary = runtime === "apple" ? "container" : runtime;
      return `${binary} exec -it ${id}`;
    }
  }
  return `docker exec -it ${trimmed}`;
}
