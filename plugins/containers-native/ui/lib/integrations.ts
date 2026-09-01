import type { BrowserTabsCapability } from "@termco/browser-base";
import type { ContainerRuntime } from "@termco/containers-base";
import type { SshForwardInfo, SshForwardInput } from "@termco/ssh-base";
import type { WorkspaceExecutionCapability, WorkspaceTabsCapability } from "@termco/workspace-base";
import { containersWorkspace } from "./native";

export type ContainerTabTarget = {
  runtime: ContainerRuntime;
  id: string;
  name: string;
};

export interface ContainerRemoteIntegration {
  forwardList(connectionId?: string): Promise<SshForwardInfo[]>;
  forwardEnsure(connectionId: string): Promise<SshForwardInfo[]>;
  forwardAdd(connectionId: string, input: SshForwardInput): Promise<SshForwardInfo>;
  forwardRemove(id: string): Promise<void>;
}

let remoteIntegration: ContainerRemoteIntegration | null = null;
let browserTabs: BrowserTabsCapability | null = null;
let workspaceTabs: WorkspaceTabsCapability | null = null;
let runTerminal: ((command: string, cwd?: string) => Promise<void>) | null = null;

export function containerIntegrationsActive(): boolean {
  return remoteIntegration !== null || browserTabs !== null || workspaceTabs !== null || runTerminal !== null;
}

export function configureContainerIntegrations(input: {
  ssh?: ContainerRemoteIntegration | null;
  execution?: WorkspaceExecutionCapability | null;
  browser: BrowserTabsCapability | null;
  tabs: WorkspaceTabsCapability | null;
}): void {
  remoteIntegration = input.execution
    ? executionRemoteIntegration(input.execution)
    : (input.ssh ?? null);
  browserTabs = input.browser;
  workspaceTabs = input.tabs;
}

export function setContainerTerminalRunner(
  runner: ((command: string, cwd?: string) => Promise<void>) | null,
): void {
  runTerminal = runner;
}

export function containerSsh(): ContainerRemoteIntegration {
  if (!remoteIntegration) throw new Error("remote workspace execution is not configured");
  return remoteIntegration;
}

function executionRemoteIntegration(
  execution: WorkspaceExecutionCapability,
): ContainerRemoteIntegration {
  const invoke = <T>(method: string, args: readonly unknown[]) => {
    const workspace = containersWorkspace();
    if (!workspace || workspace.kind !== "ssh") {
      return Promise.reject(new Error("SSH workspace execution is not selected"));
    }
    return execution.invoke<T>(workspace, { domain: "ssh", method, args });
  };
  return {
    forwardList: (connectionId) => invoke("forwardList", [connectionId]),
    forwardEnsure: (connectionId) => invoke("forwardEnsure", [connectionId]),
    forwardAdd: (connectionId, input) => invoke("forwardAdd", [connectionId, input]),
    forwardRemove: (id) => invoke("forwardRemove", [id]),
  };
}

export function openContainerBrowser(url: string): void {
  if (!browserTabs) throw new Error("browser.tabs is not configured");
  browserTabs.open(url);
}

export function openContainerDetailTab(target: ContainerTabTarget): number {
  if (!workspaceTabs) {
    throw new Error("workspace.tabs is not configured for containers");
  }
  const snapshot = workspaceTabs.snapshot();
  const existing = snapshot.tabs.find(
    (tab) =>
      tab.kind === "container" &&
      tab.data?.runtime === target.runtime &&
      tab.data?.containerId === target.id,
  );
  if (existing) {
    workspaceTabs.transition({
      tabs:
        existing.title === target.name && existing.data?.name === target.name
          ? snapshot.tabs
          : snapshot.tabs.map((tab) =>
              tab.id === existing.id
                ? {
                    ...tab,
                    title: target.name,
                    data: { ...tab.data, name: target.name },
                  }
                : tab,
            ),
      activeId: existing.id,
    });
    return existing.id;
  }
  const [id] = workspaceTabs.allocate(1);
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
  workspaceTabs.transition({
    tabs: [
      ...snapshot.tabs,
      {
        id,
        rigId: active?.rigId ?? snapshot.activeRigIdForNewTabs,
        kind: "container",
        title: target.name,
        data: {
          runtime: target.runtime,
          containerId: target.id,
          name: target.name,
        },
      },
    ],
    activeId: id,
  });
  return id;
}

export async function runContainerTerminal(command: string): Promise<void> {
  if (!runTerminal) throw new Error("terminal tab integration is not available");
  await runTerminal(command);
}
