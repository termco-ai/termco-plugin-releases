import type { ContainersCapability } from "@termco/containers-base";
import type { GitCapability } from "@termco/git-base";
import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkflowDefinition,
  WorkflowDefinitionsContribution,
  WorkflowParameterSourceContribution,
  WorkflowRunnerContribution,
} from "@termco/workflows-base";
import type { WorkspaceEnv, WorkspaceTabsCapability } from "@termco/workspace-base";
import { BUILTIN_WORKFLOWS } from "./builtins";
import {
  containerExecPrefix,
  containerImageOptions,
  containerOptions,
  portOptions,
  sshHostOptions,
} from "./domain";
import { createWorkflowTerminalActions } from "./renderer";

function dependsOn(
  workflow: WorkflowDefinition,
  dependency: "git" | "containers" | "ssh",
): boolean {
  const sources = new Set(workflow.parameters.map((parameter) => parameter.source));
  if (dependency === "git") {
    return workflow.tags.includes("git") || sources.has("branch") || sources.has("git_remote");
  }
  if (dependency === "containers") {
    return workflow.target.kind === "container" ||
      workflow.tags.some((tag) => ["docker", "container", "containers"].includes(tag)) ||
      sources.has("container") || sources.has("container_image");
  }
  return workflow.target.kind === "ssh" || sources.has("ssh_host") || sources.has("port");
}

export function builtinDefinitions(
  dependency: "core" | "git" | "containers" | "ssh",
): WorkflowDefinitionsContribution {
  const workflows = BUILTIN_WORKFLOWS.filter((workflow) => {
    if (dependency === "git") return dependsOn(workflow, "git");
    if (dependency === "containers") {
      return !dependsOn(workflow, "git") && dependsOn(workflow, "containers");
    }
    if (dependency === "ssh") {
      return !dependsOn(workflow, "git") &&
        !dependsOn(workflow, "containers") &&
        dependsOn(workflow, "ssh");
    }
    return !dependsOn(workflow, "git") &&
      !dependsOn(workflow, "containers") &&
      !dependsOn(workflow, "ssh");
  });
  return { id: `builtin-${dependency}`, workflows };
}

export function terminalRunner(
  tabs: WorkspaceTabsCapability,
  terminals: TerminalSessionsCapability,
): WorkflowRunnerContribution {
  const actions = createWorkflowTerminalActions(tabs, terminals);
  return {
    id: "terminal",
    targetKinds: ["focused_terminal", "new_terminal"],
    available: () => true,
    async run({ target, command }) {
      if (target.kind === "new_terminal") {
        await actions.runInNewTerminal(
          command,
          target.cwd === "inherit" ? undefined : target.cwd,
        );
      } else {
        await actions.runInFocusedTerminal(command);
      }
      return { ok: true, command };
    },
  };
}

export function containerRunner(
  _containers: ContainersCapability,
  tabs: WorkspaceTabsCapability,
  terminals: TerminalSessionsCapability,
): WorkflowRunnerContribution {
  const actions = createWorkflowTerminalActions(tabs, terminals);
  return {
    id: "containers",
    targetKinds: ["container"],
    available: (target) => target.kind === "container" && Boolean(target.ref),
    async run({ target, command }) {
      if (target.kind !== "container" || !target.ref) {
        return { ok: false, unavailable: true, error: "No container selected." };
      }
      const prefix = containerExecPrefix(target.ref);
      if (!prefix) {
        return { ok: false, unavailable: true, error: "That container is not available." };
      }
      const executed = `${prefix} ${command}`;
      await actions.runInNewTerminal(executed);
      return { ok: true, command: executed };
    },
  };
}

export function sshRunner(ssh: SshClientCapability): WorkflowRunnerContribution {
  return {
    id: "ssh",
    targetKinds: ["ssh"],
    available: (target) => target.kind === "ssh" && Boolean(target.ref),
    async run({ target, command }) {
      if (target.kind !== "ssh" || !target.ref) {
        return { ok: false, unavailable: true, error: "No SSH host selected." };
      }
      const result = await ssh.runSsh(ssh.resolveTarget({ connectionId: target.ref }), command);
      if (!ssh.ok(result)) {
        return {
          ok: false,
          error: result.stderr || `SSH command exited with ${result.exitCode}`,
        };
      }
      return { ok: true, command };
    },
  };
}

export function gitParameterSource(
  git: GitCapability,
): WorkflowParameterSourceContribution {
  return {
    id: "git",
    sources: ["branch", "git_remote"],
    async options({ source, workspace, rootPath }) {
      if (!rootPath) return [];
      const repo = await git.resolveRepo(rootPath, workspace as WorkspaceEnv);
      if (!repo) return [];
      if (source === "branch") {
        return (await git.listBranches(repo.repoRoot, workspace as WorkspaceEnv)).branches
          .map((branch) => ({
            value: branch.name,
            label: branch.name,
            hint: branch.isHead ? "current" : branch.kind,
          }));
      }
      return [];
    },
  };
}

export function containerParameterSource(
  containers: ContainersCapability,
): WorkflowParameterSourceContribution {
  return {
    id: "containers",
    sources: ["container", "container_image"],
    async options({ source, workspace }) {
      const result = await containers.list(workspace as WorkspaceEnv);
      const entries = result.containers ?? [];
      return source === "container"
        ? containerOptions(entries)
        : containerImageOptions(entries);
    },
  };
}

export function sshParameterSource(
  ssh: SshClientCapability,
): WorkflowParameterSourceContribution {
  return {
    id: "ssh",
    sources: ["ssh_host", "port"],
    async options({ source, workspace }) {
      if (source === "ssh_host") {
        return sshHostOptions(
          ssh.listHosts().map((host) => ({ host: host.alias, user: host.user })),
        );
      }
      const env = workspace as WorkspaceEnv;
      const connectionId = env?.kind === "ssh" ? env.connectionId : undefined;
      return portOptions(await ssh.forwardList(connectionId));
    },
  };
}
